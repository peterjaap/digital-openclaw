import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GioUnix from 'gi://GioUnix';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON_FILE = 'icons/digital-openclaw-symbolic.svg';

// Played when the lid closes while the inhibitor is active, so the laptop
// does not go into a bag while it is still running.
const WARNING_SOUND = 'dialog-warning';
const WARNING_BEEPS = 3;
const WARNING_INTERVAL_MS = 600;

// Holds a logind "handle-lid-switch" inhibitor while `wanted` is true.
// This is the same mechanism gsd-power uses for external monitors and
// what `systemd-inhibit --what=handle-lid-switch` does.
class LidInhibitor {
    constructor(onChange) {
        this._onChange = onChange;
        this._wanted = false;
        this._pending = false;
        this._stream = null;
        this._destroyed = false;
    }

    get active() {
        return this._stream !== null;
    }

    set wanted(value) {
        this._wanted = value;
        this._apply();
    }

    _apply() {
        if (this._wanted && !this._stream && !this._pending && !this._destroyed)
            this._request();
        else if (!this._wanted && this._stream)
            this._release();
    }

    _request() {
        this._pending = true;
        Gio.DBus.system.call_with_unix_fd_list(
            'org.freedesktop.login1',
            '/org/freedesktop/login1',
            'org.freedesktop.login1.Manager',
            'Inhibit',
            new GLib.Variant('(ssss)', [
                'handle-lid-switch',
                'Digital OpenClaw',
                'User chose to keep running with the lid closed',
                'block',
            ]),
            new GLib.VariantType('(h)'),
            Gio.DBusCallFlags.NONE,
            -1, null, null,
            (conn, res) => {
                this._pending = false;
                try {
                    const [ret, fdList] = conn.call_with_unix_fd_list_finish(res);
                    const [index] = ret.deep_unpack();
                    const fds = fdList.steal_fds();
                    fds.forEach((fd, i) => {
                        const stream = new GioUnix.InputStream({fd, close_fd: true});
                        if (i === index && this._wanted && !this._destroyed && !this._stream)
                            this._stream = stream;
                        else
                            stream.close(null);
                    });
                } catch (e) {
                    console.error(`Digital OpenClaw: Inhibit() failed: ${e.message}`);
                }
                this._onChange();
                this._apply();
            });
    }

    _release() {
        try {
            this._stream.close(null);
        } catch (e) {
            console.error(`Digital OpenClaw: closing inhibitor failed: ${e.message}`);
        }
        this._stream = null;
        this._onChange();
    }

    destroy() {
        this._destroyed = true;
        this._wanted = false;
        if (this._stream)
            this._release();
    }
}

const LidIndicator = GObject.registerClass(
class LidIndicator extends SystemIndicator {
    _init(settings, gicon) {
        super._init();
        this._settings = settings;

        this._icon = this._addIndicator();
        this._icon.gicon = gicon;

        this._toggle = new QuickToggle({
            title: 'OpenClaw',
            gicon,
            toggleMode: true,
        });
        this.quickSettingsItems.push(this._toggle);

        this._inhibitor = new LidInhibitor(() => this._sync());

        this._settings.bind('enabled', this._toggle, 'checked',
            Gio.SettingsBindFlags.DEFAULT);
        this._changedId = this._settings.connect('changed::enabled',
            () => this._update());

        this._warningId = 0;
        this._lidId = global.backend.connect('lid-is-closed-changed',
            (backend, closed) => this._onLidChanged(closed));

        this._update();
    }

    _onLidChanged(closed) {
        this._stopWarning();
        if (closed && this._inhibitor.active &&
            this._settings.get_boolean('lid-close-sound'))
            this._startWarning();
    }

    _startWarning() {
        const player = global.display.get_sound_player();
        let beeps = 0;
        const beep = () => {
            player.play_from_theme(WARNING_SOUND,
                'Digital OpenClaw: lid closed while the laptop stays awake', null);
            beeps++;
            if (beeps < WARNING_BEEPS)
                return GLib.SOURCE_CONTINUE;
            this._warningId = 0;
            return GLib.SOURCE_REMOVE;
        };
        beep();
        this._warningId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            WARNING_INTERVAL_MS, beep);
    }

    _stopWarning() {
        if (this._warningId) {
            GLib.source_remove(this._warningId);
            this._warningId = 0;
        }
    }

    _update() {
        this._inhibitor.wanted = this._settings.get_boolean('enabled');
        this._sync();
    }

    _sync() {
        const wanted = this._settings.get_boolean('enabled');
        const active = this._inhibitor.active;
        if (active)
            this._toggle.subtitle = 'Lid: stay awake';
        else if (wanted)
            this._toggle.subtitle = 'Lid: not active';
        else
            this._toggle.subtitle = 'Lid: suspend';
        this._icon.visible = active;
    }

    destroy() {
        this._stopWarning();
        global.backend.disconnect(this._lidId);
        this._settings.disconnect(this._changedId);
        Gio.Settings.unbind(this._toggle, 'checked');
        this._inhibitor.destroy();
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        super.destroy();
    }
});

export default class DigitalOpenClawExtension extends Extension {
    enable() {
        this._indicator = new LidIndicator(this.getSettings(),
            Gio.icon_new_for_string(`${this.path}/${ICON_FILE}`));
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
