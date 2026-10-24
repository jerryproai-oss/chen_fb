import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const dir = 'D:/Vibe Coding/Codex/chen_fb/outputs/01a16c05-convert';
const wb=Workbook.create();
const s=wb.worksheets.add('404班費明細');
s.showGridLines=false;
s.getRange('A1:E16').format.font={name:'Microsoft JhengHei',size:11};
s.getRange('A1:E16').format.rowHeight=29;
s.getRange('A1:E16').format.verticalAlignment='center';
s.getRange('A1:A16').format.columnWidth=8;
s.getRange('B1:B16').format.columnWidth=48;
s.getRange('C1:D16').format.columnWidth=15;
s.getRange('E1:E16').format.columnWidth=12;
s.mergeCells('A1:E1');
s.getRange('A1').values=[['親愛的404家長您好~~以下是四年級上學期結束時，班費支出明細']];
s.getRange('A1').format.font.bold=true;
s.getRange('A1').format.rowHeight=38;
s.getRange('A3:E12').values=[
['項次','項目','收入','支出','備註'],
[1,'每人交500*23=',11500,null,null],
[2,'3下班費剩餘',6439,null,null],
[3,'平時練習卷B4',null,1680,null],
[4,'學習檔案夾和文具',null,1225,null],
[5,'護貝姓名屋',null,230,null],
[6,'學校上學期影印費  合併下學期一起算',null,null,null],
[7,'期中慶生娃娃蛋糕35*23',null,805,null],
[8,'期末慶生布丁芋頭蛋糕',null,660,null],
[9,'期末同樂PIZZA 3個',null,888,null]];
s.getRange('A3:E3').format={fill:'#34495E',font:{bold:true,color:'#FFFFFF'},horizontalAlignment:'center'};
s.getRange('C4:D14').setNumberFormat('#,##0');
s.getRange('A4:A12').format.horizontalAlignment='center';
s.getRange('B4:B12').format.wrapText=true;
s.getRange('A9:E9').format.rowHeight=38;
s.getRange('A14:B14').values=[['►','收、支總金額']];
s.getRange('C14:D14').formulas=[['=SUM(C4:C12)','=SUM(D4:D12)']];
s.getRange('A14:E14').format.fill='#E9EEF3';
s.getRange('A14:E14').format.font.bold=true;
s.mergeCells('A15:E15');
s.getRange('A15').values=[['四年級上學期支出後，剩餘班費        12451元']];
s.getRange('A15').format.font.bold=true;
s.mergeCells('A16:E16');
s.getRange('A16').values=[['靜真老師 2026/03/09']];
s.getRange('A16').format.horizontalAlignment='right';
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'404班費明細!A14:E16',include:'values,formulas',maxChars:2000,tableMaxCols:5,tableMaxRows:3})).ndjson);
const vals=s.getRange('C14:D14').values[0];
if(vals[0]!==17939||vals[1]!==5488||vals[0]-vals[1]!==12451)throw Error('Totals mismatch');
const img=await wb.render({sheetName:s.name,range:'A1:E16',scale:1.5});
await fs.writeFile(`${dir}/preview.png`,new Uint8Array(await img.arrayBuffer()));
await (await SpreadsheetFile.exportXlsx(wb)).save(`${dir}/班費404上.xlsx`);
