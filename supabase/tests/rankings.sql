-- Run as an administrator. All test identities and achievements roll back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); words text[]; result jsonb;
begin
  insert into auth.users(id) values(a),(b);
  select array_agg(word) into words from word_game_private.questions;
  perform set_config('request.jwt.claim.sub',a::text,true);
  result:=public.word_game_sync('Проверка',array[words[1],words[1]]);
  assert (result->>'solved')::int=1,'Duplicate inflated result';
  result:=public.word_game_sync('Проверка',words);
  assert (result->>'solved')::int=1000;
  assert (result->>'seals')::int=10;
  result:=public.word_game_sync('Проверка',words);
  assert (select count(*) from word_game_private.completions where user_id=a)=1;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.word_game_sync('Проверка2',words);
  assert (select completion_no from word_game_private.completions where user_id=b)>
    (select completion_no from word_game_private.completions where user_id=a);
  assert not has_function_privilege('anon','public.word_game_sync(text,text[])','execute');
  assert not has_table_privilege('authenticated','word_game_private.players','update');
  assert not has_table_privilege('authenticated','word_game_private.completions','insert');
end $$;
rollback;
