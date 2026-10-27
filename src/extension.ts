import * as vscode from 'vscode';

// Разбиваем текст на слова
function splitWords(text: string): string[] {
    const normalized = text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim();
    return normalized.length ? normalized.split(/\s+/) : [];
}

// НОВАЯ ФУНКЦИЯ: обрабатывает текст построчно, чтобы не ломать переносы строк
function processLines(text: string, processor: (line: string) => string): string {
    return text.split(/\r?\n/).map(line => {
        if (!line.trim()) return line; // пустые строки не трогаем
        return processor(line);
    }).join('\n');
}

function toCamelCase(text: string): string {
    return processLines(text, (line) => {
        const words = splitWords(line);
        if (!words.length) return line;
        return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    });
}

function toSnakeCase(text: string): string {
    return processLines(text, (line) => {
        const words = splitWords(line);
        if (!words.length) return line;
        return words.map(w => w.toLowerCase()).join('_');
    });
}

function toPascalCase(text: string): string {
    return processLines(text, (line) => {
        const words = splitWords(line);
        if (!words.length) return line;
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    });
}

// Функция подсчета стилей
function countCases(text: string) {
    const words = text.match(/[a-zA-Z0-9_]+/g) || [];
    let camel = 0, snake = 0, pascal = 0, constant = 0, other = 0;

    for (const word of words) {
        if (/^[A-Z0-9_]+$/.test(word) && /[A-Z]/.test(word)) {
            constant++;
        } else if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(word)) {
            snake++;
        } else if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*$/.test(word)) {
            pascal++;
        } else if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(word)) {
            camel++;
        } else {
            other++;
        }
    }
    return { total: words.length, camel, snake, pascal, constant, other };
}

export function activate(context: vscode.ExtensionContext) {

    const applyTextTransformation = async (transformFn: (text: string) => string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Откройте файл!');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const text = selection.isEmpty ? document.getText() : document.getText(selection);
        
        const newText = transformFn(text);

        if (text === newText) {
            vscode.window.showInformationMessage('Текст уже в нужном формате (изменений не требуется).');
            return;
        }

        await editor.edit(editBuilder => {
            if (selection.isEmpty) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                editBuilder.replace(fullRange, newText);
            } else {
                editBuilder.replace(selection, newText);
            }
        });
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('text-refactoring.checkCase', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const text = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
            const stats = countCases(text);
            vscode.window.showInformationMessage(
                `Найдено слов: ${stats.total}. camelCase: ${stats.camel}, snake_case: ${stats.snake}, PascalCase: ${stats.pascal}, CONSTANT_CASE: ${stats.constant}, остальные: ${stats.other}`
            );
        }),

        vscode.commands.registerCommand('text-refactoring.toCamelCase', () => applyTextTransformation(toCamelCase)),
        vscode.commands.registerCommand('text-refactoring.toSnakeCase', () => applyTextTransformation(toSnakeCase)),
        vscode.commands.registerCommand('text-refactoring.toPascalCase', () => applyTextTransformation(toPascalCase)),
        
        vscode.commands.registerCommand('text-refactoring.cleanBlankLines', () => {
            const config = vscode.workspace.getConfiguration('textRefactoring');
            const maxEmptyLines = config.get<number>('maxEmptyLines', 1);
            applyTextTransformation((text) => {
                const regex = new RegExp(`(\\r?\\n){${maxEmptyLines + 2},}`, 'g');
                const replacement = '\n'.repeat(maxEmptyLines + 1);
                return text.replace(regex, replacement);
            });
        }),

        vscode.commands.registerCommand('text-refactoring.removeExtraSpaces', () => {
            applyTextTransformation((text) => text.replace(/[ \t]{2,}/g, ' '));
        }),

        vscode.commands.registerCommand('text-refactoring.removeDuplicateLines', () => {
            applyTextTransformation((text) => {
                const lines = text.split(/\r?\n/);
                return [...new Set(lines)].join('\n');
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('text-refactoring.showStatistics', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const text = editor.document.getText();
            const lines = text.split(/\r?\n/);
            const totalLines = lines.length;
            const emptyLines = lines.filter(l => l.trim() === '').length;
            const uniqueLines = new Set(lines);
            const duplicateLines = totalLines - uniqueLines.size;
            const extraSpaces = (text.match(/[ \t]{2,}/g) || []).length;
            
            const caseStats = countCases(text);

            const panel = vscode.window.createWebviewPanel(
                'textStats',
                'Text Stats',
                vscode.ViewColumn.Two,
                { enableScripts: true }
            );

            panel.webview.html = getWebviewContent(totalLines, emptyLines, duplicateLines, extraSpaces, caseStats);
        })
    );

    const updateCommandVisibility = () => {
        const config = vscode.workspace.getConfiguration('textRefactoring');
        vscode.commands.executeCommand('setContext', 'textRefactoring.enableCamelCase', config.get('enableCamelCase'));
        vscode.commands.executeCommand('setContext', 'textRefactoring.enableSnakeCase', config.get('enableSnakeCase'));
        vscode.commands.executeCommand('setContext', 'textRefactoring.enablePascalCase', config.get('enablePascalCase'));
        vscode.commands.executeCommand('setContext', 'textRefactoring.enableCleanBlankLines', config.get('enableCleanBlankLines'));
        vscode.commands.executeCommand('setContext', 'textRefactoring.enableRemoveExtraSpaces', config.get('enableRemoveExtraSpaces'));
        vscode.commands.executeCommand('setContext', 'textRefactoring.enableRemoveDuplicateLines', config.get('enableRemoveDuplicateLines'));
    };

    updateCommandVisibility();
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('textRefactoring')) {
            updateCommandVisibility();
        }
    }, null, context.subscriptions);
}

function getWebviewContent(total: number, empty: number, dupes: number, spaces: number, caseStats: any): string {
    const max = Math.max(total, empty, dupes, spaces, caseStats.camel, caseStats.snake, caseStats.pascal, caseStats.constant, 1);
    
    const createBar = (label: string, value: number, color: string) => {
        const width = (value / max) * 100;
        return `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 14px; margin-bottom: 4px;">${label}: <b>${value}</b></div>
                <div style="width: 100%; background: #333; height: 18px; border-radius: 4px;">
                    <div style="width: ${width}%; background: ${color}; height: 100%; border-radius: 4px;"></div>
                </div>
            </div>
        `;
    };

    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; padding: 20px; color: #ddd; background: #1e1e1e; }
                h2 { margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px; }
                h3 { margin-top: 25px; font-size: 16px; color: #aaa; }
            </style>
        </head>
        <body>
            <h2>Статистика файла</h2>
            
            <h3>Общая статистика:</h3>
            ${createBar('Всего строк', total, '#4CAF50')}
            ${createBar('Пустые строки', empty, '#FFC107')}
            ${createBar('Дубликаты', dupes, '#F44336')}
            ${createBar('Лишние пробелы', spaces, '#2196F3')}

            <h3>Статистика по стилям (кол-во слов):</h3>
            ${createBar('camelCase', caseStats.camel, '#00BCD4')}
            ${createBar('snake_case', caseStats.snake, '#9C27B0')}
            ${createBar('PascalCase', caseStats.pascal, '#E91E63')}
            ${createBar('CONSTANT_CASE', caseStats.constant, '#FF9800')}
            ${createBar('Обычный текст', caseStats.other, '#9E9E9E')}
        </body>
        </html>
    `;
}