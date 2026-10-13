#!/bin/bash
# Run on macOS with Xcode 26.6. Works on Astra and GitHub-hosted runners.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SIGNING_DIRECTORY:?Set the private directory holding the Mailthing profile and distribution certificate}"
: "${ASC_KEY_ID:?}" "${ASC_ISSUER_ID:?}" "${ASC_KEY_PATH:?}"
: "${BUILD_NUMBER:?Allocate a new App Store Connect build number}"
export RELEASE_VERSION=${RELEASE_VERSION:-1.0.3}
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid build number' >&2; exit 1; }
[[ "$RELEASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release version' >&2; exit 1; }
node scripts/apple.mjs validate-version
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
task_temp=$(mktemp -d "$SIGNING_DIRECTORY/keychain.XXXXXX")
keychain="$task_temp/signing.keychain-db"
old_keychains=$(security list-keychains -d user | tr -d '"')
saved_keychains=()
while IFS= read -r line; do
  line="${line#${line%%[![:space:]]*}}"
  [[ -n "$line" ]] && saved_keychains+=("$line")
done <<< "$old_keychains"
keychain_password=$(openssl rand -hex 32)
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  # Restore the original user search list; never replace/delete a user's login keychain.
  security list-keychains -d user -s "${saved_keychains[@]}" || true
  rm -rf "$task_temp"
}
trap cleanup EXIT
trap 'echo "Release failed at line $LINENO" >&2' ERR
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$SIGNING_DIRECTORY/distribution.p12" -k "$keychain" -P "$(cat "$SIGNING_DIRECTORY/p12-password.txt")" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
curl --fail --silent --show-error https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer -o "$task_temp/AppleWWDRCAG3.cer"
security import "$task_temp/AppleWWDRCAG3.cer" -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
# Add the temporary chain without removing other running builds' chains.
security list-keychains -d user -s "$keychain" "${saved_keychains[@]}"
security cms -D -k "$keychain" -i "$SIGNING_DIRECTORY/Mailthing_AppStore.mobileprovision" > "$task_temp/profile.plist"
profile_uuid=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$task_temp/profile.plist")
PROFILE_PATH="$task_temp/profile.plist" python3 - <<'PY'
import datetime, os, plistlib
p = plistlib.load(open(os.environ['PROFILE_PATH'], 'rb'))
e = p['Entitlements']
assert p['TeamIdentifier'] == ['27ZLS4MK3J']
assert e['application-identifier'] == '27ZLS4MK3J.com.ericjohney.mailthing'
assert e.get('aps-environment') == 'production', 'Profile must authorize production push'
assert e.get('get-task-allow') is False and 'ProvisionedDevices' not in p
assert p['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
PY
profile_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$profile_dir"
cp "$SIGNING_DIRECTORY/Mailthing_AppStore.mobileprovision" "$profile_dir/$profile_uuid.mobileprovision"
xcodegen generate
archive=${ARCHIVE_PATH:-$PWD/build/Mailthing.xcarchive}
export_path=${EXPORT_PATH:-$PWD/export}
xcodebuild archive -project Mailthing.xcodeproj -scheme Mailthing -configuration Release -destination 'generic/platform=iOS' -archivePath "$archive" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" MARKETING_VERSION="$RELEASE_VERSION" DEVELOPMENT_TEAM=27ZLS4MK3J \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=B6EAE1911511211D276420A918E4C38825D5CFE6 \
  PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" OTHER_CODE_SIGN_FLAGS="--keychain $keychain"
EXPORT_PLIST="$task_temp/export.plist" PROFILE_UUID="$profile_uuid" python3 - <<'PY'
import os, plistlib
plistlib.dump({'method': 'app-store-connect', 'signingStyle': 'manual', 'teamID': '27ZLS4MK3J', 'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True, 'provisioningProfiles': {'com.ericjohney.mailthing': os.environ['PROFILE_UUID']}}, open(os.environ['EXPORT_PLIST'], 'wb'))
PY
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$export_path" -exportOptionsPlist "$task_temp/export.plist"
app="$archive/Products/Applications/Mailthing.app"
codesign --verify --deep --strict "$app"
codesign -d --entitlements :- "$app" > "$task_temp/entitlements.plist" 2>/dev/null
ENTITLEMENTS="$task_temp/entitlements.plist" APP_PATH="$app" BUILD_NUMBER="$BUILD_NUMBER" RELEASE_VERSION="$RELEASE_VERSION" python3 - <<'PY'
import os, plistlib
ent = plistlib.load(open(os.environ['ENTITLEMENTS'], 'rb'))
info = plistlib.load(open(os.path.join(os.environ['APP_PATH'], 'Info.plist'), 'rb'))
assert ent['aps-environment'] == 'production'
assert ent['application-identifier'] == '27ZLS4MK3J.com.ericjohney.mailthing'
assert ent.get('get-task-allow', False) is False
assert info['CFBundleIdentifier'] == 'com.ericjohney.mailthing'
assert info['CFBundleVersion'] == os.environ['BUILD_NUMBER']
assert info['CFBundleShortVersionString'] == os.environ['RELEASE_VERSION']
assert info['MailthingServerURL'] == 'https://mailthing.ericj5.com'
PY
mkdir -p "$task_temp/private_keys"
cp "$ASC_KEY_PATH" "$task_temp/private_keys/AuthKey_$ASC_KEY_ID.p8"
chmod 600 "$task_temp/private_keys/AuthKey_$ASC_KEY_ID.p8"
API_PRIVATE_KEYS_DIR="$task_temp/private_keys" xcrun altool --upload-app --file "$export_path/Mailthing.ipa" --type ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo 'Mailthing uploaded. Check App Store Connect processing and internal tester availability.'
