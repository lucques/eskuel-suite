# Legacy Eskuel game XML compatibility profile

This document describes backward-compatible handling of historical Eskuel game XML. Legacy is not a format version and has no embedded version number or XML Schema. A document selects this compatibility profile by omitting `format-version`, `db-system`, and `db-system-min-version` from its `game` root.

Legacy documents use the historical permissive structure with implicit `db-system=sqlite` and `db-system-min-version=3.0.0`. Existing unversioned documents remain loadable and playable; opening one does not modify it. Saving an opened legacy game writes a new, explicit version 2 representation.

Legacy `image-scene` elements may omit `media-type` and may contain either raw base64 or the historical data-URL form. The reader detects PNG, JPEG, WebP, AVIF, and GIF from the decoded bytes and normalizes the detected type into the current game model. Current writers always emit the explicit `media-type` annotation.

Eskuel Suite applies its [default implementation limits](../../implementation-limits.md), including the complete XML and per-image limits, to legacy files as well as versioned files. Exceeding a limit does not make a legacy document structurally invalid.

The compatibility profile is frozen around historical input. New file-format features are introduced only through numbered formats such as v1 and v2; they do not create successive “legacy versions.” A document that declares either `db-system` or `db-system-min-version` without `format-version` is invalid, and an explicit unsupported `format-version` is rejected rather than interpreted as legacy.
