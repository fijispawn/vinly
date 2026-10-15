import json, os, signal, tempfile, subprocess, time, urllib.request, urllib.error, http.cookiejar, shutil, random
port=random.randrange(34100,34900)
tmp=tempfile.mkdtemp(prefix='wine-brackets-test-')
proc=subprocess.Popen(['npm','run','start','--','-p',str(port)],env={**os.environ,'PORT':str(port),'DATA_DIR':tmp},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
base='http://localhost:'+str(port)+'/api'
clients={}
def request(who,path,method='GET',data=None):
    if who not in clients:
        clients[who]=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    body=json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(base+path,body,headers={'Content-Type':'application/json'} if body else {},method=method)
    try:
        with clients[who].open(req,timeout=5) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise AssertionError(str(e.code)+' '+e.read().decode())
def login(who):
    request(who,'/auth/register','POST',{'login':who,'password':'long-test-password-123','name':who})
    assert request(who,'/me')['user']['login']==who
try:
    for i in range(120):
        try: request('public','/me'); break
        except: time.sleep(.05)
    for who in ['host','alice','bob']: login(who)
    try:
        request('wrong','/auth/login','POST',{'login':'alice','password':'wrong-password'})
        raise AssertionError('Wrong password accepted')
    except AssertionError as e:
        if '401' not in str(e): raise
    request('alice','/me/password','PATCH',{'currentPassword':'long-test-password-123','newPassword':'another-long-password-456'})
    try:
        request('old-password','/auth/login','POST',{'login':'alice','password':'long-test-password-123'})
        raise AssertionError('Old password accepted')
    except AssertionError as e:
        if '401' not in str(e): raise
    request('returning','/auth/login','POST',{'login':'alice','password':'another-long-password-456'})
    assert request('returning','/me')['user']['login']=='alice'
    manual=request('alice','/diary/wines','POST',{'name':'Моё вино','sourceUrl':'https://example.com/wine/1','vintage':'2025'})['entries'][0]
    assert manual['origin']=='manual' and manual['wine']['name']=='Моё вино'
    assert request('bob','/diary')['entries']==[]
    manual_id=manual['id'].removeprefix('manual:')
    request('alice','/diary/wines/'+manual_id,'PATCH',{'name':'Моё вино — правка','vintage':'2025'})
    assert request('alice','/diary')['entries'][0]['wine']['name']=='Моё вино — правка'
    request('alice','/diary/'+manual['id'],'PATCH',{'text':'Личная заметка','again':True})
    assert request('alice','/diary')['entries'][0]['diaryNote']['text']=='Личная заметка'
    request('alice','/diary/'+manual['id'],'DELETE')
    assert request('alice','/diary')['entries']==[]
    disposable=request('host','/games','POST',{'title':'Временное лобби'})['game']['code']
    request('alice','/games/'+disposable+'/join','POST',{'name':'Алиса','avatar':3,'frame':'star'})
    try:
        request('alice','/games/'+disposable,'DELETE')
        raise AssertionError('Player deleted the lobby')
    except AssertionError as e:
        if '403' not in str(e): raise
    request('host','/games/'+disposable,'DELETE')
    assert disposable not in [game['code'] for game in request('host','/games')['games']]
    assert disposable not in [game['code'] for game in request('alice','/games')['games']]
    try:
        request('public','/games/'+disposable+'/public')
        raise AssertionError('Deleted lobby is still accessible')
    except AssertionError as e:
        if '404' not in str(e): raise
    mapless=request('host','/games','POST',{'title':'Без карты','showRegionMap':False})['game']
    assert mapless['showRegionMap'] is False
    assert request('public','/games/'+mapless['code']+'/public')['game']['showRegionMap'] is False
    request('host','/games/'+mapless['code'],'DELETE')
    code=request('host','/games','POST',{'title':'Тестовый вечер','minPlayers':2})['game']['code']
    request('alice','/games/'+code+'/join','POST',{'name':'Алиса','avatar':3,'frame':'star','frameColor':'olive'})
    assert request('public','/games/'+code+'/public')['game']['players'][0]['frame']=='star'
    assert request('public','/games/'+code+'/public')['game']['players'][0]['frameColor']=='olive'
    try:
        request('bob','/games/'+code+'/join','POST',{'name':'Алиса','avatar':5,'frame':'heart'})
        raise AssertionError('Duplicate lobby name accepted')
    except AssertionError as e:
        if '409' not in str(e): raise
    for i in range(1,6): request('host','/games/'+code+'/wines','POST',{'name':'Секретное вино '+str(i),'price':1000+i,'country':'Аргентина'})
    assert 'Секретное' not in json.dumps(request('public','/games/'+code+'/public'),ensure_ascii=False)
    assert 'Аргентина' not in json.dumps(request('alice','/games/'+code),ensure_ascii=False)
    request('host','/games/'+code+'/confirm-numbers','POST',{})
    try:
        request('host','/games/'+code+'/start','POST',{})
        raise AssertionError('Started before enough players joined')
    except AssertionError as e:
        if '409' not in str(e): raise
    request('bob','/games/'+code+'/join','POST',{'name':'Боб','avatar':5,'frame':'heart'})
    assert request('alice','/games/'+code)['game']['players'][1]['avatar']==5
    g=request('host','/games/'+code+'/start','POST',{})['game']
    assert len(g['matches'])==4
    assert len([m for m in g['matches'] if m['round']==0])==1
    for rnd in range(4):
        g=request('host','/games/'+code+'/open','POST',{})['game']
        m=next(m for m in g['matches'] if m['id']==g['currentMatchId'])
        ids=[next(w['id'] for w in g['wines'] if w['number']==n) for n in [m['a'],m['b']]]
        ratings={wid:{'acidity':3,'aroma':4,'body':2,'impression':5} for wid in ids}
        for idx,who in enumerate(['alice','bob']):
            request(who,'/games/'+code+'/answer','POST',{'vote':ids[idx if rnd==0 else 0],'ratings':ratings})
        g=request('host','/games/'+code+'/close','POST',{})['game']
        if rnd==0:
            assert next(m for m in g['matches'] if m['id']==g['currentMatchId'])['status']=='tie'
            for idx,who in enumerate(['alice','bob']):
                request(who,'/games/'+code+'/answer','POST',{'vote':ids[idx]})
            g=request('host','/games/'+code+'/close','POST',{})['game']
        assert next(m for m in g['matches'] if m['id']==g['currentMatchId'])['status']=='result'
        g=request('host','/games/'+code+'/next','POST',{})['game']
    assert g['phase']=='final'
    assert len(request('alice','/diary')['entries'])==0
    g=request('host','/games/'+code+'/reveal','POST',{})['game']
    assert g['phase']=='revealed'
    assert g['revealStep']==0
    assert len(request('alice','/diary')['entries'])==0
    for step in range(1,len(g['wines'])+3):
        g=request('host','/games/'+code+'/reveal-next','POST',{})['game']
        public=request('public','/games/'+code+'/public')['game']
        assert public['revealStep']==step
        assert len([w for w in public['wines'] if 'name' in w])==min(step,len(g['wines']))
        if step<len(g['wines'])+2: assert len(request('alice','/diary')['entries'])==0
    entries=request('alice','/diary')['entries']
    assert len(entries)==5
    assert any(len(e['history'])>1 for e in entries)
    request('alice','/diary/'+entries[0]['id'],'DELETE')
    assert len(request('alice','/diary')['entries'])==4
    assert len(request('alice','/diary/export')['entries'])==4
    assert len(request('bob','/diary')['entries'])==5
    try:
        request('alice','/diary/'+entries[0]['id'],'DELETE')
        raise AssertionError('Deleted wine remained in the diary')
    except AssertionError as e:
        if '404' not in str(e): raise
    no_map=request('host','/games','POST',{'title':'Турнир без карты','minPlayers':1,'showRegionMap':False})['game']['code']
    request('alice','/games/'+no_map+'/join','POST',{'name':'Алиса','avatar':3,'frame':'star'})
    for i in range(2): request('host','/games/'+no_map+'/wines','POST',{'name':'Вино без карты '+str(i+1)})
    request('host','/games/'+no_map+'/confirm-numbers','POST',{})
    request('host','/games/'+no_map+'/start','POST',{})
    g=request('host','/games/'+no_map+'/open','POST',{})['game']
    m=next(m for m in g['matches'] if m['id']==g['currentMatchId'])
    ids=[next(w['id'] for w in g['wines'] if w['number']==n) for n in [m['a'],m['b']]]
    ratings={wid:{'acidity':3,'aroma':4,'body':2,'impression':5} for wid in ids}
    request('alice','/games/'+no_map+'/answer','POST',{'vote':ids[0],'ratings':ratings})
    request('host','/games/'+no_map+'/close','POST',{})
    assert request('host','/games/'+no_map+'/next','POST',{})['game']['phase']=='final'
    g=request('host','/games/'+no_map+'/reveal','POST',{})['game']
    assert g['revealTotal']==3 and g['showRegionMap'] is False
    for step in range(1,4):
        g=request('host','/games/'+no_map+'/reveal-next','POST',{})['game']
        assert g['revealStep']==step
        assert any(e['gameId']==g['id'] for e in request('alice','/diary')['entries'])==(step==3)
    try:
        request('host','/games/'+no_map+'/reveal-next','POST',{})
        raise AssertionError('Extra reveal stage accepted')
    except AssertionError as e:
        if '409' not in str(e): raise
    print('PASS: 5 бутылок, приватность, ничья, финал с картой и без, дневник, личные вина')
finally:
    os.killpg(proc.pid,signal.SIGTERM)
    try: proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid,signal.SIGKILL)
        proc.wait()
    shutil.rmtree(tmp)
