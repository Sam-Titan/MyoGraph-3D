# 3D asset license

`heart.glb` and its lighter twin `heart.mobile.glb` are built by `scripts/build_heart_glb.py` from
**BodyParts3D 4.0** meshes (selected by `config/anatomy.yaml`): merged, recentred, rescaled, axis-converted,
decimated, with the coronary arteries thickened (`inflate`). The heart mesh also carries a derived per-vertex
`_TERRITORY` attribute (distance-based weights to each artery: an approximate, nearest-artery illustration).

## Credit

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

Source: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/

## License of this file

Both files are derivatives of BodyParts3D and are released under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Why BY-SA: the BodyParts3D website states CC BY 4.0, but the source OBJ headers still embed
"Creative Commons Attribution-Share Alike 2.1 Japan". Releasing the derivative under CC BY-SA 4.0
satisfies both the CC BY 4.0 site license and the CC BY-SA 2.1 JP terms embedded in the source files.

The code in this repository remains MIT; this license applies only to the 3D asset.
