# Digital OpenClaw

<img src="icons/digital-openclaw-symbolic.svg" width="64" alt="Digital OpenClaw icon">

Digital OpenClaw is a GNOME Shell extension that keeps your laptop awake when you close the lid. It adds one toggle, "OpenClaw", to the Quick Settings menu.

## How it works

When you turn the toggle on, the extension asks systemd-logind for a `handle-lid-switch` inhibitor lock in `block` mode. An inhibitor lock is a request that stops logind from doing an action. When you connect an external monitor, GNOME uses the same lock. When you turn the toggle off, the extension releases the lock, and the laptop suspends on lid close again.

The extension stays active on the lock screen. Without that, GNOME releases the lock when the screen locks, and the laptop suspends after all. The toggle keeps its state after you log out and log in again.

While the lock is active, a claw icon shows in the top bar.

Older extensions change the `lid-close-ac-action` and `lid-close-battery-action` keys of `org.gnome.settings-daemon.plugins.power`. The power plugin of GNOME 46 does not read these keys, so those extensions have no effect. Digital OpenClaw talks to logind directly.

## Requirements

- GNOME Shell 46, 47, 48, 49 or 50
- systemd-logind
- `glib-compile-schemas`, to compile the settings schema

## Install

1. Clone the repository into your extensions folder:

   ```sh
   git clone https://github.com/peterjaap/digital-openclaw.git \
     ~/.local/share/gnome-shell/extensions/digital-openclaw@peterjaap
   ```

2. Compile the settings schema:

   ```sh
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/digital-openclaw@peterjaap/schemas
   ```

3. Log out and log in again. On Wayland, GNOME Shell finds a new extension only at login.

4. Enable the extension:

   ```sh
   gnome-extensions enable digital-openclaw@peterjaap
   ```

## Use

1. Open the Quick Settings menu in the top-right corner.
2. Click "OpenClaw".
3. Make sure that the subtitle changes from "Lid: suspend" to "Lid: stay awake".

If logind refused the lock, the subtitle shows "Lid: not active". In that case, read the GNOME Shell log with `journalctl --user -b | grep "Digital OpenClaw"`.

You can also set the toggle from a terminal. Use `false` to turn it off:

```sh
gsettings --schemadir ~/.local/share/gnome-shell/extensions/digital-openclaw@peterjaap/schemas \
  set org.gnome.shell.extensions.digital-openclaw enabled true
```

## Make sure that it works

Turn the toggle on and run:

```sh
systemd-inhibit --list
```

The list must show a line for "Digital OpenClaw" with `handle-lid-switch` and `block`. When you turn the toggle off, that line goes away.

## Warning

Before you put the laptop in a bag, turn the toggle off. A laptop that runs with the lid closed can get hot.

## Uninstall

```sh
gnome-extensions disable digital-openclaw@peterjaap
rm -rf ~/.local/share/gnome-shell/extensions/digital-openclaw@peterjaap
```

## License

MIT. See [LICENSE](LICENSE).
