# Third-party notices for npm packages

The original source code in the `cesiumjs-copc`, `cesiumjs-copc-core`,
`cesiumjs-copc-runtime`, `cesiumjs-copc-worker`, and `cesiumjs-copc-analysis` packages
is licensed under the project's MIT License.

The package archives do not bundle production dependencies. npm installs those
dependencies as separate packages, each governed by its own license. Depending on
which package and entry points an application uses, its installed dependency graph
may include the following software. Version ranges are those declared for release
0.1.2; the application's lockfile records the exact resolved versions.

| Component                                                         | Declared or transitive version      | License and attribution                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [CesiumJS](https://github.com/CesiumGS/cesium)                    | `^1.144.0` peer dependency          | Apache-2.0. Copyright 2011-2026 CesiumJS Contributors. CesiumJS and its assets are not included in these package archives. |
| [copc](https://github.com/connormanning/copc.js)                  | `^0.0.9`                            | MIT. Copyright (c) 2021 Connor Manning.                                                                                    |
| [cross-fetch](https://github.com/lquixada/cross-fetch)            | `^4.1.0`, through `copc`            | MIT. Copyright (c) 2017 Leonardo Quixadá.                                                                                  |
| [node-fetch](https://github.com/node-fetch/node-fetch)            | `^2.7.0`, through `cross-fetch`     | MIT. Copyright (c) 2016 David Frank.                                                                                       |
| [laz-perf](https://github.com/hobuinc/laz-perf)                   | `^0.0.7`, through `copc`            | Apache-2.0. Copyright 2022 Rapidlasso, GmbH.                                                                               |
| [Proj4js](https://github.com/proj4js/proj4js)                     | `^2.19.10`                          | MIT. Copyright (c) 2014 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf.   |
| [mgrs](https://github.com/proj4js/mgrs)                           | `1.0.0`, through Proj4js            | MIT. Copyright (c) 2012 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral, Calvin Metcalf.      |
| [wkt-parser](https://github.com/proj4js/wkt-parser)               | `^1.5.5`, through Proj4js           | MIT. Copyright (c) 2014 Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf.   |
| [egm96-universal](https://github.com/nicolas-van/egm96-universal) | `^1.1.1`                            | MIT. Copyright (c) 2020 Nicolas Vanhoren.                                                                                  |
| [rfc4648](https://github.com/swansontec/rfc4648.js)               | `^1.5.0`, through `egm96-universal` | MIT. Copyright © 2022 William R Swanson.                                                                                   |

The `laz-perf@0.0.7` npm archive does not contain its upstream license file. To keep
the Apache-2.0 terms available offline, the installed `cesiumjs-copc-core` package
includes an exact copy of `laz-perf`'s `COPYING` file from source commit
`d0d3047e05221421fa0b02b3da4e93797edb2c52` at
`third_party/laz-perf-COPYING`.

No sample point-cloud data or CesiumJS runtime assets are included in these npm
package archives. For demo data attribution and the repository-wide inventory, see
the project's
[complete third-party notices](https://github.com/yangseungsang/cesiumjs-copc-runtime/blob/main/THIRD_PARTY_NOTICES.md).
