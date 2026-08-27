# Documentation index

Start with [Getting started](getting-started.md) if you want to render a COPC file, or
with [Architecture](architecture.md) if you want to understand how the runtime works
before changing it.

## Using the runtime

| Document                                       | Read this when                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [Getting started](getting-started.md)          | Loading your first COPC file into a CesiumJS viewer                |
| [API reference](api-reference.md)              | Looking up an option, method, or event on the public packages      |
| [Coordinate systems](coordinate-systems.md)    | Your data uses a projected CRS, a compound CRS, or orthometric height |
| [Troubleshooting](troubleshooting.md)          | Nothing renders, ranges fail, or colors look wrong                 |

## Understanding the design

| Document                                       | Read this when                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [Architecture](architecture.md)                | Tracing the path from an HTTP range to a rendered point            |
| [ADR-0001](adr/0001-native-copc-runtime.md)    | Asking why COPC is streamed directly instead of converted          |
| [Design strategy](design-strategy.md)          | Looking for the longer rationale behind the package split and roadmap |
| [Project brief](project-brief.md)              | Looking for the original problem statement this project answers    |

## Measuring and contributing

| Document                                       | Read this when                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [Evaluation evidence](evaluation-evidence.ko.md) | Reviewing the project against the first-round written criteria    |
| [Benchmarks](benchmarks.md)                    | Reproducing the published streaming and decode numbers             |
| [Pipeline comparison](pipeline-comparison.md)  | Weighing direct streaming against converting to 3D Tiles           |
| [Development](development.md)                  | Setting up the workspace and running the quality gates             |
| [Roadmap](roadmap.md)                          | Checking what is planned before opening a feature request          |
| [Contributing](../CONTRIBUTING.md)             | Preparing your first pull request                                  |
