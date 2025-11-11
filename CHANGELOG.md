## [1.0.0] - 2025-11-07

- Initial release.

## [1.0.1] - 2025-11-08

- Added a setting to control whether the extension should convert WAV files or not;
- Fixed a setting description;
- Fixed compilation termination for Windows;
- Fixed async functions that disrupt the progress wheel;
- Fixed a check for WAV file conversion.

## [1.0.2] - 2025-11-09

- Corrected a silly mistake about cleaning;
- Corrected automatic language detection;
- Fixed a small looking flaw in a string;
- Fixed setting that reverts when it fails behavior;
- Refactored README.md.

## [1.0.3] - 2025-11-10

- Rewrote standalone file logic to make assembling work without saving the file;
- Corrected a dumb mistake that made the WAV conversion logic run twice;
- Corrected flag concatenation error when there are none;
- Fixed settings description clarity and correctness;
- Added a sanity check to see if the user has written an empty program;
- Added sanity checks in PCM Processing for missing folders;
- Some very minor performance fixes during assembling.