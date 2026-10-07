insert into public.duuk_mail_templates(title,subject,body,created_by)
select t.title,t.subject,replace(t.body,chr(92)||'n',chr(10)),p.id from (values
 ('Primeiro contato','Uma ideia para a sua marca','Olá, {nome}! Tudo bem?\n\nSomos a DUUK Films. Gostaríamos de conhecer os próximos projetos da sua marca e conversar sobre como podemos contar essa história juntos.\n\nQual seria um bom horário para uma conversa?\n\nEquipe DUUK'),
 ('Follow-up','Podemos retomar nossa conversa?','Olá, {nome}!\n\nPassando para retomar nossa conversa e saber se podemos ajudar com alguma informação.\n\nFico à disposição.\n\nEquipe DUUK'),
 ('Proposta','Proposta DUUK Films','Olá, {nome}!\n\nConforme conversamos, segue nossa proposta em anexo. Podemos marcar uma conversa para alinhar os detalhes?\n\nEquipe DUUK'),
 ('Pós-reunião','Próximos passos da nossa conversa','Olá, {nome}!\n\nObrigado pela conversa. Vamos organizar os próximos passos e preparar uma proposta alinhada ao que discutimos.\n\nEquipe DUUK'),
 ('Agradecimento','Obrigado por criar com a DUUK','Olá, {nome}!\n\nObrigado pela confiança e pela oportunidade de contar essa história juntos. Conte com a DUUK para os próximos projetos.\n\nEquipe DUUK')
) t(title,subject,body) cross join lateral (select id from public.duuk_profiles where is_super_admin order by created_at limit 1) p;
