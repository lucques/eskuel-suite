# Eskuel Suite default implementation limits

The Eskuel game XML and SQL metadata specifications define file formats, not unbounded resource commitments. The defaults below are the compatibility target for files intended for the Eskuel Suite implementation. A file can conform to its format specification while exceeding an implementation limit, and another reader may choose different limits.

| Resource | Default limit | Measurement |
|---|---:|---|
| Complete game XML file | 20 MiB | UTF-8 byte length of the complete XML document, including base64 text |
| Complete Eskuel game package | 128 MiB | Byte length of the complete `.eskuelgame` ZIP archive before decompression |
| Eskuel game-package descriptor | 64 KiB | UTF-8 byte length of the decompressed `datapackage.json` file |
| Individual Eskuel game-package license text | 256 KiB | UTF-8 byte length of one decompressed file referenced by `licenses[].path` |
| Individual Eskuel game-package notice text | 1 MiB | UTF-8 byte length of one decompressed file referenced by `notices[].path` |
| Eskuel game-package provenance text | 1 MiB | UTF-8 byte length of the decompressed file referenced by `provenance.path` |
| Eskuel game-package XML resource | 20 MiB | UTF-8 byte length of the decompressed game XML resource |
| Eskuel game-package database dependency | 100 MiB | Byte length of the complete nested `.eskueldb` archive after outer decompression |
| Image input before editor resizing | 24 MiB | Byte length of the selected or fetched PNG, JPEG, WebP, AVIF, or GIF file data |
| Image input dimensions before editor resizing | 32,000,000 pixels | Image width multiplied by image height |
| Individual embedded image | 2 MiB | Byte length of the decoded but still compressed PNG, JPEG, WebP, AVIF, or GIF file data |
| Individual embedded image width | 2,400 pixels | Width declared by the image file |
| Individual embedded image height | 1,200 pixels | Height declared by the image file |
| Standalone SQL initialization script | 100 MiB | UTF-8 byte length of the complete script, including its metadata header |
| SQLite database file or resulting live database | 100 MiB | Binary input size and the SQLite database page size multiplied by its page count |
| Complete Eskuel database package | 100 MiB | Byte length of the complete `.eskueldb` ZIP archive before decompression |
| Eskuel database-package descriptor | 64 KiB | UTF-8 byte length of the decompressed `datapackage.json` file |
| Individual Eskuel database-package license text | 256 KiB | UTF-8 byte length of one decompressed file referenced by `licenses[].path` |
| Individual Eskuel database-package notice text | 1 MiB | UTF-8 byte length of one decompressed file referenced by `notices[].path` |
| Eskuel database-package provenance text | 1 MiB | UTF-8 byte length of the decompressed file referenced by `provenance.path` |
| Eskuel database-package resource | 100 MiB | Byte length of the one decompressed SQL script or SQLite database resource |
| PostgreSQL resulting live database | 100 MiB | Value reported by `pg_database_size(current_database())` after initialization and each SQL execution |
| Remotely fetched source | 128 MiB | Number of transferred bytes; the lower resource-specific limit still applies |
| Materialized SQL query result | 10,000 rows | Total rows across all result tables returned by one execution |
| Displayed SQL result table | 50 rows | Rows retained in UI-facing session state and shown per result table |

One MiB is 1,048,576 bytes. The embedded-image byte limit applies after base64 decoding but before image pixel decoding, while the game XML limit includes the larger base64 representation. Base64 normally adds roughly one third to the binary size. Every embedded resource also contributes to the complete game XML size, so the effective maximum for an embedded SQLite database is lower than the general SQLite database limit.

The editor checks the 24 MiB input limit before reading a selected file into memory. It then reads the image dimensions from the file header and applies the 32,000,000-pixel input limit before asking the browser to decode the pixels. These input limits protect the image-processing step and do not describe the image stored in the game.

The editor preserves an image that already satisfies the embedded byte, width, and height limits. When a static image exceeds any embedded limit, the editor attempts to resize it without upscaling, preserve its aspect ratio within 2,400 × 1,200 pixels, and re-encode it; it may reduce the dimensions further to fit the 2 MiB byte limit, and rejects the selection if it cannot produce a valid result. Re-encoding preserves PNG, JPEG, and WebP output types, converts static AVIF to WebP, and converts static GIF to PNG. An animated PNG, WebP, AVIF, or GIF that already satisfies the embedded limits is preserved, but one that would require resizing or re-encoding is rejected to avoid silently discarding its animation.

The game reader applies the 2 MiB, 2,400-pixel width, and 1,200-pixel height limits to each embedded image in legacy and versioned games. Width and height are the only embedded-image dimension constraints; there is no embedded pixel-count limit. There is also no separate image-count or aggregate-image limit beyond the complete XML file limit. The editor displays an estimate based on the current serialized XML size and recalculates it after committed game changes, including image and database replacements. Save and export operations serialize the current game again and refuse to write it when its exact Blob size exceeds the complete game XML limit.

These values are runtime policy. Eskuel deployments can configure different limits, and changing an Eskuel Suite default does not require a new game XML format version, game-package format version, SQL metadata format version, or database-package format version. Exceeding a limit should be reported as a resource-limit failure rather than a format-conformance error.
