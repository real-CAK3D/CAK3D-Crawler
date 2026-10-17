// Runs in CI after `npx cap add android`: stamps the version from package.json / the tag
// and adds release signing that reads the keystore from environment variables.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const file = "android/app/build.gradle";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const tag = (process.env.GITHUB_REF_NAME || "").replace(/^v/, "");
const versionName = /^\d+\.\d+\.\d+/.test(tag) ? tag : pkg.version;
const versionCode = Number(process.env.GITHUB_RUN_NUMBER || 1) + 100;

let g = readFileSync(file, "utf8");
g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
g += `
android {
    signingConfigs {
        release {
            if (System.getenv("KS_PATH")) {
                storeFile file(System.getenv("KS_PATH"))
                storePassword System.getenv("KS_PASS")
                keyAlias "crawler"
                keyPassword System.getenv("KS_PASS")
                storeType "pkcs12"
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;
writeFileSync(file, g);

// let the app talk plain HTTP to a computer on the home network (Ollama or LM Studio don't use HTTPS there)
const manifest = "android/app/src/main/AndroidManifest.xml";
let m = readFileSync(manifest, "utf8");
if (!m.includes("usesCleartextTraffic")) m = m.replace("<application", '<application android:usesCleartextTraffic="true"');

// "Share to Arachnotes" and "Open with Arachnotes": links, text, PDFs, books, Office files, pages, photos and code
const TYPES = ["text/*", "application/pdf", "application/epub+zip", "application/rtf", "application/json", "application/xml", "application/xhtml+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet", "application/x-ipynb+json", "application/zip", "image/*"];
const data = TYPES.map(t => `<data android:mimeType="${t}" />`).join("\n                ");
const filters = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                ${data}
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                ${data}
            </intent-filter>`;
if (!m.includes("android.intent.action.SEND")) {
  // inside the main activity, after its launcher filter
  const at = m.indexOf("</intent-filter>", m.indexOf("android.intent.category.LAUNCHER")) + "</intent-filter>".length;
  if (at < "</intent-filter>".length) throw new Error("couldn't find the main activity's launcher filter");
  m = m.slice(0, at) + filters + m.slice(at);
}
writeFileSync(manifest, m);

// the ShareIn plugin hands what was shared to the app's JavaScript (see crawlShared in src/arachnotes.html)
const pkgDir = "android/app/src/main/java/com/arachnotes/web";
mkdirSync(pkgDir, { recursive: true });
writeFileSync(`${pkgDir}/ShareInPlugin.java`, `package com.arachnotes.web;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// Text, links and files shared to the app (Share menu) or opened with it ("Open with").
// Files are copied into the app's cache so the web view can read them.
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private JSObject pending;

    @Override
    public void load() {
        // the app was started by a share: keep it until the page asks for it
        JSObject d = read(getActivity().getIntent());
        if (d != null) { pending = d; getActivity().setIntent(new Intent()); }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject d = read(intent);
        if (d != null) notifyListeners("shared", d, true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = new JSObject();
        if (pending != null) r.put("item", pending);
        pending = null;
        call.resolve(r);
    }

    private JSObject read(Intent in) {
        if (in == null || in.getAction() == null) return null;
        try {
            String action = in.getAction();
            if (Intent.ACTION_SEND.equals(action)) {
                Uri stream = in.getParcelableExtra(Intent.EXTRA_STREAM);
                if (stream != null) return file(stream, in.getType());
                CharSequence text = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text == null) return null;
                JSObject d = new JSObject();
                d.put("kind", "text");
                d.put("text", text.toString());
                String subject = in.getStringExtra(Intent.EXTRA_SUBJECT);
                if (subject != null) d.put("subject", subject);
                return d;
            }
            if (Intent.ACTION_VIEW.equals(action) && in.getData() != null) return file(in.getData(), in.getType());
        } catch (Exception e) {
            JSObject d = new JSObject();
            d.put("kind", "error");
            d.put("message", String.valueOf(e.getMessage()));
            return d;
        }
        return null;
    }

    private JSObject file(Uri uri, String type) throws IOException {
        String name = "shared";
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0 && c.getString(i) != null) name = c.getString(i);
            }
        } catch (Exception ignored) { }
        if ("shared".equals(name) && uri.getLastPathSegment() != null) name = uri.getLastPathSegment();
        File dir = new File(getContext().getCacheDir(), "shared");
        if (!dir.exists()) dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) for (File o : old) o.delete();
        File out = new File(dir, name.replaceAll("[\\\\\\\\/:*?\\"<>|]", "_"));
        long total = 0;
        try (InputStream is = getContext().getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (is == null) throw new IOException("can't open");
            byte[] buf = new byte[65536];
            int n;
            while ((n = is.read(buf)) > 0) {
                os.write(buf, 0, n);
                total += n;
                if (total > 80_000_000L) throw new IOException("too big");
            }
        }
        String mime = type != null ? type : getContext().getContentResolver().getType(uri);
        JSObject d = new JSObject();
        d.put("kind", "file");
        d.put("path", out.getAbsolutePath());
        d.put("name", name);
        d.put("type", mime != null ? mime : "");
        return d;
    }
}
`);
writeFileSync(`${pkgDir}/MainActivity.java`, `package com.arachnotes.web;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
console.log(`Android version ${versionName} (${versionCode})`);
