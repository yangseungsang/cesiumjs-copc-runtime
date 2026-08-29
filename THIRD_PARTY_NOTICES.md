# Third-party notices

CesiumJS COPC Runtime's original source code is licensed under the repository's
[MIT License](LICENSE). That license does not replace the licenses or attribution
requirements of the third-party software, data, and quoted material identified
below.

## Runtime and demo software

Versions below are the versions resolved by `package-lock.json` for the current
demo build. The production demo publishes the corresponding license texts under
`licenses/` so that they remain available next to the bundled JavaScript, WebAssembly,
and CesiumJS assets.

| Component                                                         | Version | License    | Use and attribution                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CesiumJS](https://github.com/CesiumGS/cesium)                    | 1.144.0 | Apache-2.0 | Copyright 2011-2026 CesiumJS Contributors. CesiumJS's complete `LICENSE.md`, including its bundled third-party notices, and `ThirdParty.json` are redistributed with the demo.                                                                                                                                  |
| [copc](https://github.com/connormanning/copc.js)                  | 0.0.9   | MIT        | Copyright (c) 2021 Connor Manning.                                                                                                                                                                                                                                                                              |
| [cross-fetch](https://github.com/lquixada/cross-fetch)            | 4.1.0   | MIT        | Copyright (c) 2017 Leonardo Quixadá. A dependency of `copc`; its Node.js path uses `node-fetch`.                                                                                                                                                                                                                |
| [node-fetch](https://github.com/node-fetch/node-fetch)            | 2.7.0   | MIT        | Copyright (c) 2016 David Frank. A dependency of `cross-fetch`.                                                                                                                                                                                                                                                  |
| [laz-perf](https://github.com/hobuinc/laz-perf)                   | 0.0.7   | Apache-2.0 | Copyright 2022 Rapidlasso, GmbH. Used by `copc` and by the demo's LAZ decoder; the demo bundles its WebAssembly binary. Because the npm package omits its license file, the upstream `COPYING` file from source commit `d0d3047e05221421fa0b02b3da4e93797edb2c52` is preserved in this repository and the demo. |
| [Proj4js](https://github.com/proj4js/proj4js)                     | 2.21.0  | MIT        | Copyright (c) 2014 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf.                                                                                                                                                                                             |
| [mgrs](https://github.com/proj4js/mgrs)                           | 1.0.0   | MIT        | Copyright (c) 2012 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral, Calvin Metcalf. A dependency of Proj4js.                                                                                                                                                                       |
| [wkt-parser](https://github.com/proj4js/wkt-parser)               | 1.5.6   | MIT        | Copyright (c) 2014 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf. A dependency of Proj4js.                                                                                                                                                                    |
| [egm96-universal](https://github.com/nicolas-van/egm96-universal) | 1.1.1   | MIT        | Copyright (c) 2020 Nicolas Vanhoren.                                                                                                                                                                                                                                                                            |
| [rfc4648](https://github.com/swansontec/rfc4648.js)               | 1.5.4   | MIT        | Copyright © 2022 William R Swanson. A dependency of `egm96-universal`.                                                                                                                                                                                                                                          |

The npm packages in this monorepo declare these components as external dependencies;
npm therefore installs each dependency with its own package metadata and license file.
The demo is different because Vite bundles application dependencies, so its build
copies the license files explicitly. Consult `package-lock.json` for the complete
resolved dependency graph, including development-only tooling.

## Autzen Stadium sample data

The live demo loads the public
[Autzen Stadium](https://pointcloud.org/datasets/autzen/) airborne LiDAR dataset by
remote URL; the dataset itself is not redistributed in this repository.

- Airborne LiDAR collected by Watershed Sciences, Inc. in 2010.
- Manual classification into 21 classes by Max Sampson of Hobu, Inc. in 2021.
- Data providers listed by pointcloud.org: Watershed Sciences, Inc.; Hobu, Inc.; and
  PDAL.
- Licensed under
  [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
  (CC BY 4.0).
- Canonical COPC URL:
  `https://data.pointcloud.org/autzen/autzen-classified.copc.laz`.

The screenshots in this repository are project-generated renderings of that dataset.
Cropping, camera placement, runtime color mapping, classification filtering, and the
viewer overlays are changes made for the demo and documentation. The underlying data
remains subject to CC BY 4.0 and is not relicensed under this project's MIT License.

## Gaia3D OSSP 2026 task brief

[`docs/project-brief.md`](docs/project-brief.md) summarizes and contains short
quotations from the
[official Gaia3D OSSP 2026 task page](https://www.kossa.kr/materials/2026/ossp/tasks-gaia3d.html).
The project's MIT License applies to the repository authors' original analysis and
implementation notes, not to third-party quoted material or the original task page.

Third-party names and marks are used only to identify their respective projects,
products, and data sources. No endorsement is implied.
