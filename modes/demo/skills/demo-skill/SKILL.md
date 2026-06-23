# demo-skill

A pack-local skill registered **only** in `modes/demo/skills/index.yaml`. It
resolves only while the `demo` mode is active — proof that a pack composes over
the engine without any engine (`pb.mjs`) change. It points to the pack-local
process `demo-proc`.

This file is an existence proof, not a working skill. See `modes/demo.yaml`.
