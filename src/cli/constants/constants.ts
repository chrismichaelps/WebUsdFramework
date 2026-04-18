const pkg = JSON.parse(require("fs").readFileSync(require("path").resolve(process.cwd(), "package.json"), "utf-8")) as { version: string }
export const CLI_VERSION: string = pkg.version

export const SUPPORTED_EXTENSIONS = [".glb", ".gltf", ".obj", ".fbx", ".stl", ".ply"] as const

export const DEFAULT_OUTPUT_EXTENSION = ".usdz"

export const HELP_TEXT = `webusd - Convert 3D models to USDZ format

Usage:
  webusd <input> [options]

Arguments:
  input                    Path to the input file (.glb, .gltf, .obj, .fbx, .stl, .ply)

Options:
  -o, --output <path>      Output file path (default: <input>.usdz)
  -d, --debug              Enable debug mode with intermediate files
  --decimate <n>           Target face count for mesh decimation (PLY only, 0 = off)
  --up-axis <Y|Z>          Up axis (default: Y)
  --meters-per-unit <n>    Scene scale (default: 1)
  -h, --help               Show this help message
  -v, --version            Show version

Supported Formats:
  GLB, GLTF, OBJ, FBX, STL, PLY

Examples:
  webusd model.glb
  webusd model.glb -o output.usdz -d
  webusd scan.ply --decimate 500000
  webusd ./stl-folder/
`.trim()