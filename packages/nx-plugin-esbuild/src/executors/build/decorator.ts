import fs from 'fs/promises';
import path from 'path';
import { inspect } from 'util';
import type { Plugin } from 'esbuild';
import {
  ParsedCommandLine,
  transpileModule,
  findConfigFile,
  sys,
  parseConfigFileTextToJson,
  parseJsonConfigFileContent,
} from 'typescript';

import stripComments from 'strip-comments';

const theFinder = new RegExp(
  /((?<![(\s]\s*['"])@\w*[\w\d]\s*(?![;])[((?=\s)])/
);

const findDecorators = (fileContent: string | void) =>
  fileContent ? theFinder.test(stripComments(fileContent)) : false;

export type ESBuildPluginDecoratorOptions = {
  tsconfigPath?: string;
  forceTsc?: boolean;
  cwd?: string;
};

export const esbuildDecoratorPlugin = (
  options: ESBuildPluginDecoratorOptions
): Plugin => ({
  name: 'tsc',
  setup(build) {
    const tsconfigPath =
      // FIXME: load tsconfig.base.json in Nx project, in common proejct load tsconfig.json
      options.tsconfigPath ?? path.join(process.cwd(), './tsconfig.base.json');
    const forceTsc = options.forceTsc ?? false;

    let parsedTsConfig = null;

    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (!parsedTsConfig) {
        parsedTsConfig = parseTsConfig(tsconfigPath, process.cwd());
        // if (parsedTsConfig.sourcemap) {
        //   parsedTsConfig.sourcemap = false;
        //   parsedTsConfig.inlineSources = true;
        //   parsedTsConfig.inlineSourceMap = true;
        // }
        console.log('parsedTsConfig: ', parsedTsConfig);
      }

      const shouldSkipThisPlugin =
        !forceTsc &&
        (!parsedTsConfig ||
          !parsedTsConfig.options ||
          !parsedTsConfig.options.emitDecoratorMetadata);

      if (shouldSkipThisPlugin) {
        return;
      }

      const ts = await fs.readFile(path, 'utf8');
      // .catch((err) => printDiagnostics({  path, err }));

      const hasDecorator = findDecorators(ts);
      if (!hasDecorator) {
        return;
      }

      const program = transpileModule(ts, parsedTsConfig);
      return { contents: program.outputText };
    });
  },
});

function parseTsConfig(tsconfigPath: string, cwd: string) {
  // path >>> name
  const fileName = findConfigFile(cwd, sys.fileExists, tsconfigPath);

  // if the value was provided, but no file, fail hard
  if (tsconfigPath !== undefined && !fileName)
    throw new Error(`Failed to open '${fileName}'`);

  let loadedConfig = {};
  let baseDir = cwd;

  if (fileName) {
    const text = sys.readFile(fileName);
    if (text === undefined) throw new Error(`Failed to read '${fileName}'`);

    const result = parseConfigFileTextToJson(fileName, text);

    if (result.error !== undefined) {
      printDiagnostics(result.error);
      throw new Error(`Failed to parse '${fileName}'`);
    }

    loadedConfig = result.config;
    baseDir = path.dirname(fileName);
  }

  const parsedTsConfig = parseJsonConfigFileContent(loadedConfig, sys, baseDir);

  if (parsedTsConfig.errors[0]) printDiagnostics(parsedTsConfig.errors);

  return parsedTsConfig;
}

function printDiagnostics(...args: any[]) {
  console.log(inspect(args, false, 10, true));
}
