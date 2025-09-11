const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: {
      unpackDir: "node_modules/@recallai"
    },
    extraResource: [
      ".env"
    ],
    // Disable code signing - will sign manually after packaging
    // osxSign: {
    //   identity: '-', // Ad-hoc signing
    //   continueOnError: false,
    //   optionsForFile: (_) => {
    //     return {
    //       entitlements: './Entitlements.plist',
    //       'hardened-runtime': false // Required for ad-hoc signing
    //     };
    //   }
    // },
    icon: './muesli',
    appBundleId: 'com.muesli.app',
    extendInfo: {
      NSUserNotificationAlertStyle: "alert",
      CFBundleIdentifier: 'com.muesli.app',
      LSUIElement: false
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg'
    },
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-zip',
    //   platforms: ['darwin'],
    // },
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-rpm',
    //   config: {},
    // },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        devContentSecurityPolicy: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem: mediastream: file:;",
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/index.html',
              js: './src/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/preload.js',
              },
            },
          ],
        },
      },
    },
    {
      name: "@timfish/forge-externals-plugin",
      config: {
        externals: ["@recallai/desktop-sdk"],
        includeDeps: true
      }
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
