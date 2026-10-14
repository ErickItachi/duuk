export function statementCsv(rows) {
 const cell=value=>{let text=String(value??'');if(/^[\s\p{Cc}]*[=+@-]/u.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'}
 return '\ufeff'+[['Data','Descrição','Categoria','Forma','Valor (R$)','Situação'],...rows.map(row=>[row.posted_date,row.title,row.category||'',row.method||'',(row.amount_cents/100).toFixed(2).replace('.',','),row.status==='POSTED'?'Confirmada':'Pendente'])].map(line=>line.map(cell).join(';')).join('\r\n')
}
