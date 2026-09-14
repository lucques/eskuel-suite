# Eskuel game XML formats

Eskuel game XML uses explicit, monotonically increasing integer format versions. The current writer emits [format version 2](./v2/README.md).

Files without a `format-version` attribute are handled by the separate [legacy compatibility profile](./legacy/README.md). Legacy is not a format version: it identifies historical unversioned input and is never emitted by current writers.

Readers dispatch documents with `format-version="1"` or `format-version="2"` to the matching decoder while retaining the legacy decoder. Each decoder normalizes its input into the current Eskuel game model. Explicit unsupported versions are rejected.

Format conformance is independent of implementation resource limits. A reader may reject an otherwise conforming game when its configured limits for file size, embedded image byte length, image width, image height, database size, or other finite resources are exceeded, and should report that condition as a resource-limit failure rather than a format error. Authors targeting Eskuel Suite can consult its [default implementation limits](../implementation-limits.md), including the complete XML and per-image limits. Editor input and resizing limits are also implementation policy and do not affect format conformance.
