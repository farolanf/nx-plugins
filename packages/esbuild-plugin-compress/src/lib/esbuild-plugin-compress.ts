import { Plugin } from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { gzipSync, brotliCompressSync, BrotliOptions, ZlibOptions } from 'zlib';

export interface CompressOptions {
  gzip?: boolean;
  gzipOptions?: ZlibOptions;
  brotli?: boolean;
  brotliOptions?: BrotliOptions;
  removeOrigin?: boolean;
  outputDir?: string;
  verbose?: boolean;
  // TODO:
  // exclude?: string | string[];
  // sync?: boolean;
  // assets by copy plugin
}

const writeOriginFiles = (path: string, contents: Uint8Array) => {
  fs.writeFileSync(path, contents);
};

const writeGzipCompress = (
  path: string,
  contents: Uint8Array,
  options: ZlibOptions = {}
): string => {
  const outPath = `${path}.gz`;
  const stat = fs.statSync(path);
  const gzipped = gzipSync(contents, options);
  if (gzipped.length >= stat.size) return null;
  fs.writeFileSync(outPath, gzipped);
  return outPath;
};

const writeBrotliCompress = (
  path: string,
  contents: Uint8Array,
  options: BrotliOptions = {}
): string => {
  const outPath = `${path}.br`;
  const stat = fs.statSync(path);
  const gzipped = brotliCompressSync(contents, options);
  if (gzipped.length >= stat.size) return null;
  fs.writeFileSync(outPath, gzipped);
  return outPath;
};

export const compress = (options: CompressOptions = {}): Plugin => {
  const gzip = options.gzip ?? true;
  const brotli = options.brotli ?? true;
  const removeOrigin = options.removeOrigin ?? false;
  const gzipOpts = options.gzipOptions ?? {};
  const brotliOpts = options.brotliOptions ?? {};

  const noCompressSpecified = !gzip && !brotli;

  let outputDir = options.outputDir ?? null;

  return {
    name: 'plugin:compress',
    setup({ initialOptions: { outfile, outdir, write }, onEnd }) {
      if (write) {
        console.log(
          chalk.yellow('WARN'),
          ' Set write option as true to use compress plugin.'
        );
        return;
      }

      if (outputDir && !outdir && !outfile) {
        console.log(
          chalk.yellow('WARN'),
          ' When using outputDir option, outdir or outfile must be specified.'
        );
      } else if (outputDir && outfile) {
        outputDir = path.resolve(path.dirname(outfile), outputDir);
      } else if (outputDir && outdir) {
        outputDir = path.resolve(outdir, outputDir);
      }

      onEnd(async ({ metafile: { outputs } }) => {
        for (const originOutputPath of Object.keys(outputs)) {
          const contents = await fs.promises.readFile(originOutputPath);

          const writrPath = outputDir
            ? path.resolve(outputDir, path.basename(originOutputPath))
            : originOutputPath;

          if (!contents) {
            return;
          }

          if (noCompressSpecified) {
            console.log(
              chalk.yellow('WARN'),
              ' Set at least one compression as true to use compress plugin.'
            );
          } else {
            fs.ensureDirSync(path.dirname(writrPath));
          }

          const oriStat = fs.statSync(writrPath);

          if (gzip) {
            const outPath = writeGzipCompress(writrPath, contents, gzipOpts);
            if (outPath && options.verbose) {
              const stat = fs.statSync(outPath);
              console.log('generated', outPath, humanSize(oriStat.size) + ' -> ' + humanSize(stat.size))
            }
          }

          if (brotli) {
            const outPath = writeBrotliCompress(writrPath, contents, brotliOpts)
            if (outPath && options.verbose) {
              const stat = fs.statSync(outPath);
              console.log('generated', outPath, humanSize(oriStat.size) + ' -> ' + humanSize(stat.size))
            }
          }

          if (!removeOrigin || noCompressSpecified) {
            writeOriginFiles(originOutputPath, contents);
          }
        }
      });
    },
  };
};

function humanSize(size) {
  if (size < 1024) {
    return size + 'B';
  } else if (size < 1024**2) {
    return (size / 1024).toFixed(2) + 'K';
  } else if (size < 1024 ** 3) {
    return (size / 1024 ** 2).toFixed(2) + 'M';
  }
  return (size / 1024 ** 3).toFixed(2) + 'G';
}