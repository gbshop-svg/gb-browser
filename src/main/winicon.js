'use strict';
// Icône des fenêtres Brave dans la barre des tâches Windows.
// Chaque profil reçoit son propre groupe dans la barre des tâches (AppUserModelID « GB.Profil.N »),
// avec l'icône choisie (logo Vinted récupéré sur vinted.fr) et le nom du profil, au lieu du lion Brave.
// Fonctionne avec un seul PowerShell qui reste ouvert (le code C# n'est compilé qu'une fois).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const CS = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GbIcon {
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] public struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint c);
    [PreserveSig] int GetAt(uint i, out PROPERTYKEY k);
    [PreserveSig] int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    [PreserveSig] int SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    [PreserveSig] int Commit();
  }
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [Out, MarshalAs(UnmanagedType.Interface)] out IPropertyStore ps);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadImage(IntPtr hi, string name, uint type, int cx, int cy, uint flags);
  static readonly Guid FMT = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
  static void Set(IPropertyStore ps, uint pid, string val) {
    var k = new PROPERTYKEY { fmtid = FMT, pid = pid };
    var v = new PROPVARIANT { vt = 31, p = Marshal.StringToCoTaskMemUni(val) };
    ps.SetValue(ref k, ref v);
    Marshal.FreeCoTaskMem(v.p);
  }
  public static int Apply(uint pid, string ico, string appId, string name, string cmd) {
    int n = 0;
    IntPtr big = LoadImage(IntPtr.Zero, ico, 1, 32, 32, 0x10), small = LoadImage(IntPtr.Zero, ico, 1, 16, 16, 0x10);
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var sb = new StringBuilder(64); GetClassName(h, sb, 64);
      if (sb.ToString() != "Chrome_WidgetWin_1") return true;
      try {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore ps;
        if (SHGetPropertyStoreForWindow(h, ref iid, out ps) == 0 && ps != null) {
          Set(ps, 2, cmd);      // RelaunchCommand
          Set(ps, 3, ico);      // RelaunchIconResource
          Set(ps, 4, name);     // RelaunchDisplayNameResource
          Set(ps, 5, appId);    // AppUserModel.ID (en dernier)
          ps.Commit();
          Marshal.ReleaseComObject(ps);
        }
      } catch {}
      if (big != IntPtr.Zero) SendMessage(h, 0x80, (IntPtr)1, big);
      if (small != IntPtr.Zero) SendMessage(h, 0x80, IntPtr.Zero, small);
      n++;
      return true;
    }, IntPtr.Zero);
    return n;
  }
}`;

const PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
${CS}
'@
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $j = $line | ConvertFrom-Json
    $n = [GbIcon]::Apply([uint32]$j.pid, $j.ico, $j.appId, $j.name, $j.cmd)
    [Console]::Out.WriteLine('ok ' + $j.pid + ' ' + $n)
  } catch { [Console]::Out.WriteLine('err ' + $_) }
}
`;

let ps = null;
let ready = false;
const queue = [];

function start() {
  if (process.platform !== 'win32' || ps) return;
  // Script écrit dans un fichier : stdin reste libre pour les commandes (une ligne JSON par fenêtre à traiter).
  const file = path.join(os.tmpdir(), 'gb-winicon.ps1');
  try { fs.writeFileSync(file, PS, 'utf8'); } catch { return; }
  ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  ps.stdout.on('data', (d) => {
    if (!ready && String(d).includes('ready')) { ready = true; while (queue.length) ps.stdin.write(queue.shift() + '\n'); }
  });
  ps.on('exit', () => { ps = null; ready = false; });
  ps.on('error', () => { ps = null; ready = false; });
}

/** Applique l'icône et le nom aux fenêtres du processus Brave `pid`. */
function apply(pid, o) {
  if (process.platform !== 'win32' || !pid || !o.ico || !fs.existsSync(o.ico)) return;
  start();
  if (!ps) return;
  const line = JSON.stringify({ pid, ico: o.ico, appId: o.appId, name: o.name, cmd: o.cmd || '' }).replace(/\r?\n/g, ' ');
  if (ready) ps.stdin.write(line + '\n'); else queue.push(line);
}

function stop() { try { if (ps) ps.kill(); } catch {} ps = null; ready = false; }

/** Télécharge l'icône du site (favicon.ico) dans le dossier de GB, une seule fois. */
function fetchIcon(url, dest) {
  return new Promise((resolve) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 200) return resolve(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(fetchIcon(new URL(res.headers.location, url).href, dest)); }
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Un vrai fichier .ico commence par 00 00 01 00 ; une image PNG est emballée dans un .ico (accepté par Windows).
        if (buf.length > 200 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) { fs.writeFileSync(dest, buf); resolve(dest); }
        else if (buf.length > 100 && buf.readUInt32BE(0) === 0x89504e47) {
          const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
          const head = Buffer.alloc(22);
          head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
          head.writeUInt8(w >= 256 ? 0 : w, 6); head.writeUInt8(h >= 256 ? 0 : h, 7);
          head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(buf.length, 14); head.writeUInt32LE(22, 18);
          fs.writeFileSync(dest, Buffer.concat([head, buf])); resolve(dest);
        } else resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

module.exports = { apply, stop, fetchIcon };
