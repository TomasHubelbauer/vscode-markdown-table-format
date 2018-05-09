'use strict';
import { ExtensionContext, TextDocument, FormattingOptions, CancellationToken, TextEdit, languages, Position, DocumentFormattingEditProvider, window, Range, EndOfLine } from 'vscode';
import MarkDownDOM from 'markdown-dom';

type Table = {
    lines: string[];
    start: Position;
    end?: Position;
};

export function activate(context: ExtensionContext) {
    const tableFormatter = new TableFormatter();
    languages.registerDocumentFormattingEditProvider('markdown', tableFormatter);
    context.subscriptions.push(tableFormatter);
}

class TableFormatter implements DocumentFormattingEditProvider {
    constructor() {
    }

    // TODO: Preserve the correct line endings.
    provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken) {
        const tables: Table[] = [];
        let table = false;
        for (let index = 0; index < document.lineCount; index++) {
            const line = document.lineAt(index);
            if (line.text.startsWith('|')) {
                if (!table) {
                    tables.push({ lines: [line.text], start: line.range.start });
                    table = true;
                } else {
                    tables[tables.length - 1].lines.push(line.text);
                }
            } else {
                if (table) {
                    const currentTable = tables[tables.length - 1];
                    currentTable.end = line.range.start;
                    table = false;
                }
            }
        }

        const edits: TextEdit[] = [];
        for (const table of tables) {
            const dom = MarkDownDOM.parse(table.lines.join('\n'));
            if (dom.blocks.length !== 1) {
                // TODO: Report error to telemetry.
                continue;
            }

            const block = dom.blocks[0];
            if (block.type !== 'table') {
                // TODO: Telemetry.
                continue;
            }

            if (block.body.find((row: string[]) => row.length !== block.header.length)) {
                // TODO: Report possible parsing error to telemetry.
                window.showWarningMessage(`Skipping the table at line ${table.start.line} as it doesn't have matrix shape.`);
                continue;
            }

            if (block.body[0].find((cell: string) => cell.replace(/-/g, '') !== '')) {
                window.showWarningMessage(`Skipping the table at line ${table.start.line} as it doesn't have the dash row.`);
                continue;
            }

            const { header, body } = block;

            // Pop the dash row.
            body.shift();

            const columnWidths = header.map(() => 0);

            for (let index = 0; index < columnWidths.length; index++) {
                columnWidths[index] = Math.max(columnWidths[index], header[index].trim().length);
            }

            for (const row of body) {
                for (let index = 0; index < columnWidths.length; index++) {
                    columnWidths[index] = Math.max(columnWidths[index], row[index].trim().length);
                }
            }

            // TODO: Fix the extra phantom cell in MarkDownDOM.
            header.pop();

            // TODO: Read correct line breaks from MarkDownDOM.
            let markdown = '';
            markdown += '|' + header.map((cell: string, index: number) => ` ${cell.trim().padEnd(columnWidths[index])} `).join('|') + '|\n';
            markdown += '|' + header.map((cell: string, index: number) => '-'.repeat(columnWidths[index] + 2).padEnd(columnWidths[index])).join('|') + '|\n';
            for (const row of body) {
                // TODO: Fix the extra phantom cell in MarkDownDOM.
                row.pop();
                markdown += '|' + row.map((cell: string, index: number) => ` ${cell.trim().padEnd(columnWidths[index])} `).join('|') + '|\n';
            }

            edits.push(TextEdit.replace(new Range(table.start, table.end!), markdown));
        }

        return edits;
    }

    dispose() {
    }
}
