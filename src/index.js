const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

let index = 0;

function readAsset(filename) {
  const content = fs.readFileSync(filename, 'utf-8');

  const ast = parser.parse(content, {
    sourceType: 'module'
  });

  const deps = [];

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      deps.push(node.source.value);
    }
  });

  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ['@babel/preset-env']
  });

  const id = index++;

  return {
    id,
    filename,
    code,
    deps
  };
}

function createGraph(entry) {
  const entryAsset = readAsset(entry);
  const queue = [entryAsset];

  for (const asset of queue) {
    const dirname = path.dirname(asset.filename);

    asset.mapping = {};

    asset.deps.forEach((dep) => {
      const absolutePath = path.join(dirname, dep);
      const childAsset = readAsset(absolutePath);

      asset.mapping[dep] = childAsset.id;
      queue.push(childAsset);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = '';

  graph.forEach((mod) => {
    modules += `
      ${mod.id}: [
        function (require, module, exports) {
          ${mod.code}
        },
        ${JSON.stringify(mod.mapping)}
      ],
    `;
  });

  const code = `
    (function (modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(relativePath) {
          const id = mapping[relativePath];

          return require(id);
        }

        const module = {
          exports: {}
        };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      return require(0);
    })({${modules}})
  `;

  return code;
}

const graph = createGraph('./test/index.js');
const code = bundle(graph);

console.log(code);