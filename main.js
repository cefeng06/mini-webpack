const fs = require("fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const types = require("@babel/types");
const path = require("path");
const generator = require("@babel/generator").default;
const ejs = require("ejs");

const config = require("./webpack.config");

const EXPORT_DEFAULT_FUN = `
    __webpack_require__.d(__webpack_exports__, {
    "default": () => (__WEBPACK_DEFAULT_EXPORT__)
    });\n
`;

const ESMODULE_TAG_FUN = `
    __webpack_require__.r(__webpack_exports__);\n
`;

function parseFile(filePath, addFileIndex) {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const ast = parser.parse(fileContent, { sourceType: "module" });

    const dependcies = [];

    let importFilePath = "";
    let importVarName = "";
    let importCovertVarName = "";
    let hasExport = false;

    traverse(ast, {
        ImportDeclaration(p) {
            // 获取import文件的路径
            const importFile = p.node.source.value;
            importFilePath = path.join(path.dirname(filePath), importFile);
            importFilePath = `./${importFilePath}`;
            dependcies.push(importFilePath);
            const importFileIndex = addFileIndex();

            // import进来的变量名
            importVarName = p.node.specifiers[0].local.name;

            // 替换后的名字
            importCovertVarName = `__${importVarName}__WEBPACK_IMPORTED_MODULE_${importFileIndex}__`

            // 创建一个定义变量的AST
            const variableDeclaration = types.variableDeclaration("var", [
                types.variableDeclarator(
                    types.identifier(importCovertVarName),
                    types.callExpression(
                        types.identifier("__webpack_require__"),
                        [types.stringLiteral(importFilePath)]
                    )
                )
            ])
            p.replaceWith(variableDeclaration);
        },
        CallExpression(p) {
            if (p.node.callee.name === importVarName) {
                p.node.callee.name = `${importCovertVarName}.default`;
            }
        },
        Identifier(p) {
            if (p.node.name === importVarName) {
                p.node.name = `${importCovertVarName}.default`;
            }
        },
        ExportDefaultDeclaration(p) {
            hasExport = true;
            const variableDeclaration = types.variableDeclaration("const", [
                types.variableDeclarator(
                    types.identifier("__WEBPACK_DEFAULT_EXPORT__"),
                    types.identifier(p.node.declaration.name)
                )
            ])
            p.replaceWith(variableDeclaration)
        }
    });

    let newCode = generator(ast).code;

    if (hasExport) {
        newCode = `${EXPORT_DEFAULT_FUN} ${newCode}`
    }

    newCode = `${ESMODULE_TAG_FUN} ${newCode}`

    return {
        filePath,
        dependcies,
        code: newCode
    };
}

function parseFileTree(entryFilePath) {

    let importFileIndex = 0;

    function addFileIndex() {
        return importFileIndex++;
    }

    const entryFileNode = parseFile(entryFilePath, addFileIndex);
    const results = [entryFileNode];

    for (const node of results) {
        node.dependcies.forEach(path => {
            if (path) results.push(parseFile(path, addFileIndex));
        })
    }

    return results;

}

function generateCode(allAst, entry) {
    const temlateFile = fs.readFileSync(path.join(__dirname, "./template.js"), "utf-8");

    const codes = ejs.render(temlateFile, {
        __TO_REPLACE_WEBPACK_MODULES__: allAst,
        __TO_REPLACE_WEBPACK_ENTRY__: entry,
    });

    return codes;
}

const allAst = parseFileTree(config.entry);
console.log('%c [ allAst ]-129', 'font-size:13px; background:pink; color:#bf2c9f;', allAst)


const codes = generateCode(allAst, config.entry);

fs.writeFileSync(path.join(config.output.path, config.output.filename), codes);


