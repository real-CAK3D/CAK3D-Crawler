// Runs in CI after `npx cap add android`: stamps the version from package.json / the tag
// and adds release signing that reads the keystore from environment variables.
import { readFileSync, writeFileSync } from "node:fs";

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
console.log(`Android version ${versionName} (${versionCode})`);
