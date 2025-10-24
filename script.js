let repo = {
  branches: {},
  commits: {},
  tags: {},
  head: { branch: null, commit: null },
  initialized: false
};

const svg = document.getElementById('svg');
const viewport = document.getElementById('viewport');
const tooltip = document.getElementById('tooltip');
const headInfo = document.getElementById('headInfo');
const zoomLabel = document.getElementById('zoomLabel');
const clearRepoBtn = document.getElementById('clearRepoBtn');
const termOut = document.getElementById('terminalOutput');
const termIn = document.getElementById('terminalInput');

function genId(){ return Math.random().toString(36).slice(2,9); }
function short(id){ return id ? id.slice(0,6) : '-'; }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function saveCore(){ try{ localStorage.setItem('gitVisualizer_state', JSON.stringify(repo)); } catch(e){} }
function loadCore(){ 
  try{
    const raw = localStorage.getItem('gitVisualizer_state');
    if(raw){ 
      const loadedRepo = JSON.parse(raw);
      if (!loadedRepo.tags) loadedRepo.tags = {};
      repo = loadedRepo; 
    }
  }catch(e){}
}

function layout(){
  const branchKeys = Object.keys(repo.branches);
  const bi = {}; 
  branchKeys.forEach((b,i) => bi[b] = i);
  
  const depth = {};
  Object.values(repo.commits).forEach(c => { 
    if (!c.parents || c.parents.length === 0) depth[c.id] = 0; 
  });
  
  let changed = true, iter = 0; 
  const nodes = Object.values(repo.commits);
  
  while(changed && iter < 300){
    changed = false;
    iter++;
    nodes.forEach(n => {
      const ps = (n.parents || []).map(p => depth[p] === undefined ? -1 : depth[p]);
      if (ps.length === 0) return;
      
      const d = Math.max(...ps) + 1;
      if (depth[n.id] !== d){
        depth[n.id] = d;
        changed = true;
      }
    });
  }
  
  nodes.forEach(n => {
    const branch = n.branch || 'main';
    n.pos = {x: depth[n.id] || 0, y: bi[branch] || 0};
  });
}

function render(){
  headInfo.textContent = repo.head.branch ? `${repo.head.branch} (${short(repo.head.commit)})` : (repo.initialized ? `detached:${short(repo.head.commit)}` : '-');
  svg.innerHTML = '';
  const commits = Object.values(repo.commits);
  
  if(commits.length === 0){
    svg.setAttribute('viewBox','0 0 800 400');
    return;
  }
  
  const gapX = 160, gapY = 100, margin = 80;
  const maxX = Math.max(0, ...commits.map(c => c.pos.x));
  const maxY = Math.max(0, ...commits.map(c => c.pos.y));
  const width = margin * 2 + (maxX + 1) * gapX;
  const height = margin * 2 + (maxY + 2) * gapY;
  
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  
  commits.forEach(c => {
    (c.parents || []).forEach(pId => {
      const p = repo.commits[pId];
      if(!p) return;
      
      const sx = margin + p.pos.x * gapX;
      const sy = margin + (p.pos.y + 1) * gapY;
      const tx = margin + c.pos.x * gapX;
      const ty = margin + (c.pos.y + 1) * gapY;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      const dx = Math.abs(tx - sx) * 0.5;
      const d = `M ${sx} ${sy} C ${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
      
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', repo.branches[c.branch]?.color || '#94a3b8');
      path.setAttribute('stroke-width', '4');
      svg.appendChild(path);
    });
  });
  
  commits.forEach(c => {
    const x = margin + c.pos.x * gapX;
    const y = margin + (c.pos.y + 1) * gapY;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform', `translate(${x}, ${y})`);
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('r', 18);
    const fill = c.branch ? (repo.branches[c.branch]?.color || '#a78bfa') : '#94a3b8';
    circle.setAttribute('fill', fill);
    
    const isHead = repo.head.commit === c.id;
    if(isHead){
      circle.setAttribute('stroke', '#4ade80');
      circle.setAttribute('stroke-width', 3);
      circle.style.filter = 'drop-shadow(0 0 10px rgba(74,222,128,0.7))';
    } else {
      circle.setAttribute('stroke', 'rgba(255,255,255,0.06)');
      circle.setAttribute('stroke-width', 1);
    }
    
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('y', 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', '#021022');
    text.textContent = short(c.id);
    
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('y', 36);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', '#cbd5e1');
    label.textContent = c.message.length > 28 ? c.message.slice(0, 28) + '…' : c.message;
    
    g.appendChild(circle);
    g.appendChild(text);
    g.appendChild(label);
    
    drawTagsForCommit(g, c.id, x, y);
    
    g.addEventListener('mouseenter', e => showTip(e, c));
    g.addEventListener('mouseleave', hideTip);
    svg.appendChild(g);
  });
}

function drawTagsForCommit(parentG, commitId, x, y) {
  const tagsForCommit = Object.entries(repo.tags).filter(([tagName, tag]) => tag.commit === commitId);
  
  if (tagsForCommit.length === 0) return;
  
  tagsForCommit.forEach(([tagName, tag], index) => {
    const tagGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tagGroup.setAttribute('transform', `translate(${x + 25}, ${y - 25 - index * 20})`);
    
    const tagRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    tagRect.setAttribute('width', '30');
    tagRect.setAttribute('height', '16');
    tagRect.setAttribute('rx', '3');
    tagRect.setAttribute('class', tag.type === 'annotated' ? 'tag-annotated' : 'tag-lightweight');
    
    const tagText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tagText.setAttribute('x', '15');
    tagText.setAttribute('y', '11');
    tagText.setAttribute('class', 'tag-text');
    tagText.textContent = tagName.length > 6 ? tagName.slice(0, 6) + '…' : tagName;
    
    tagGroup.appendChild(tagRect);
    tagGroup.appendChild(tagText);
    parentG.appendChild(tagGroup);
    
    tagGroup.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      showTagTip(e, tagName, tag);
    });
    tagGroup.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      hideTip();
    });
  });
}

function showTip(e, c){
  let tooltipContent = `<b>${escapeHtml(c.message)}</b><div class="small" style="margin-top:6px;color:var(--muted)">${c.id}</div><div class="small" style="margin-top:4px">branch: ${c.branch || 'detached'}</div>`;
  
  const tagsForCommit = Object.entries(repo.tags).filter(([tagName, tag]) => tag.commit === c.id);
  if (tagsForCommit.length > 0) {
    tooltipContent += `<div class="small" style="margin-top:6px;color:var(--accent)">Теги: ${tagsForCommit.map(([name]) => name).join(', ')}</div>`;
  }
  
  tooltip.innerHTML = tooltipContent;
  const rect = viewport.getBoundingClientRect();
  tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
  tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
  tooltip.style.opacity = '1';
  tooltip.style.transform = 'translateY(0)';
}

function showTagTip(e, tagName, tag) {
  const tagType = tag.type === 'annotated' ? 'Аннотированный' : 'Легковесный';
  const message = tag.message ? `<div class="small" style="margin-top:4px">Сообщение: ${escapeHtml(tag.message)}</div>` : '';
  
  tooltip.innerHTML = `
    <b>Тег: ${tagName}</b>
    <div class="small" style="margin-top:4px">Тип: ${tagType}</div>
    <div class="small" style="margin-top:4px">Коммит: ${short(tag.commit)}</div>
    ${message}
  `;
  const rect = viewport.getBoundingClientRect();
  tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
  tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
  tooltip.style.opacity = '1';
  tooltip.style.transform = 'translateY(0)';
}

function hideTip(){
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(8px)';
}

function logToTerminal(text){
  const div = document.createElement('div');
  div.textContent = text;
  termOut.appendChild(div);
  termOut.scrollTop = termOut.scrollHeight;
}

function createCommit(msg){
  const id = genId();
  const parent = repo.head.commit ? repo.commits[repo.head.commit] : null;
  const commit = {
    id, 
    message: msg, 
    parents: parent ? [parent.id] : [], 
    branch: repo.head.branch, 
    pos: {x: 0, y: 0}
  };
  repo.commits[id] = commit;
  if(repo.head.branch) {
    repo.branches[repo.head.branch].head = id;
  }
  repo.head.commit = id;
  layout();
  saveCore();
  render();
}

function createBranch(name){
  if(repo.branches[name]){
    logToTerminal(`Ошибка: Ветка ${name} уже существует`);
    return;
  }
  if(!repo.head.commit){
    logToTerminal('Ошибка: Нет коммита для создания ветки');
    return;
  }
  const colors = ['#f97316','#34d399','#f472b6','#a78bfa','#f59e0b','#60a5fa','#ef4444','#10b981'];
  repo.branches[name] = {
    color: colors[Math.floor(Math.random() * colors.length)], 
    head: repo.head.commit
  };
  saveCore();
  layout();
  render();
}

function createTag(name, type = 'lightweight', message = '') {
  if (repo.tags[name]) {
    logToTerminal(`Ошибка: Тег ${name} уже существует`);
    return false;
  }
  
  if (!repo.head.commit) {
    logToTerminal('Ошибка: Нет коммита для создания тега');
    return false;
  }
  
  repo.tags[name] = {
    commit: repo.head.commit,
    type: type,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  saveCore();
  render();
  return true;
}

function deleteTag(name) {
  if (!repo.tags[name]) {
    logToTerminal(`Ошибка: Тег ${name} не найден`);
    return false;
  }
  
  delete repo.tags[name];
  saveCore();
  render();
  return true;
}

function showHelp(){
  logToTerminal('Доступные команды:');
  logToTerminal('git init         - Инициализация репозитория');
  logToTerminal('git status       - Показать текущую ветку и HEAD');
  logToTerminal('git commit -m "msg" - Создать коммит');
  logToTerminal('git branch       - Список веток или создание');
  logToTerminal('git checkout <branch> - Переключиться на ветку');
  logToTerminal('git merge <branch> - Смержить ветку в текущую');
  logToTerminal('git log          - Показать историю коммитов');
  logToTerminal('git reset --hard <commit> - Сброс HEAD на коммит');
  logToTerminal('git tag <name>   - Создать легковесный тег');
  logToTerminal('git tag -a <name> -m "msg" - Создать аннотированный тег');
  logToTerminal('git tag -d <name> - Удалить тег');
  logToTerminal('git tag          - Список всех тегов');
  logToTerminal('git checkout <tag> - Переключиться на тег');
  logToTerminal('help             - Показать справку');
}

function execCommand(cmd){
  const args = cmd.trim().split(/\s+/);
  
  if(args.length === 0 || args[0] === '') {
    return;
  }
  
  if(args[0] === 'help'){
    showHelp();
    return;
  }
  
  if(args[0] !== 'git'){
    logToTerminal(`Неизвестная команда: ${args[0]}`);
    logToTerminal('Введите "help" для списка команд');
    return;
  }
  
  const sub = args[1];
  switch(sub){
    case 'init':
      if(repo.initialized){
        logToTerminal('Репозиторий уже инициализирован'); 
        break;
      }
      repo.initialized = true;
      repo.head.branch = 'main';
      const id = genId();
      repo.commits[id] = {
        id, 
        message: 'Initial commit', 
        parents: [], 
        branch: 'main', 
        pos: {x: 0, y: 0}
      };
      repo.branches['main'] = {color: '#4ade80', head: id};
      repo.head.commit = id;
      saveCore();
      layout();
      render();
      logToTerminal('Репозиторий инициализирован');
      break;

    case 'status':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      logToTerminal(`На ветке ${repo.head.branch || '(detached HEAD)'}`);
      logToTerminal(`HEAD: ${short(repo.head.commit)}`);
      break;

    case 'commit':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      const msgIndex = args.indexOf('-m');
      if(msgIndex === -1 || !args[msgIndex + 1]){
        logToTerminal('Использование: git commit -m "сообщение"');
        break;
      }
      const message = args.slice(msgIndex + 1).join(' ').replace(/^"|"$/g, '');
      createCommit(message);
      logToTerminal(`Создан коммит: "${message}"`);
      break;

    case 'branch':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      if(!args[2]){
        logToTerminal('Список веток:');
        Object.keys(repo.branches).forEach(b => {
          logToTerminal(`${repo.head.branch === b ? '* ' : '  '}${b}`);
        });
      } else {
        createBranch(args[2]);
        logToTerminal(`Ветка ${args[2]} создана`);
      }
      break;

    case 'checkout':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      if(!args[2]){
        logToTerminal('Использование: git checkout <branch|tag>');
        break;
      }
      
      if(repo.tags[args[2]]){
        const tag = repo.tags[args[2]];
        repo.head.branch = null;
        repo.head.commit = tag.commit;
        saveCore();
        layout();
        render();
        logToTerminal(`Переключено на тег ${args[2]} (detached HEAD)`);
      }
      else if(repo.branches[args[2]]){
        repo.head.branch = args[2];
        repo.head.commit = repo.branches[args[2]].head;
        saveCore();
        layout();
        render();
        logToTerminal(`Переключено на ветку ${args[2]}`);
      } else {
        logToTerminal(`Ветка или тег ${args[2]} не найдены`);
      }
      break;

    case 'merge':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      if(!args[2]){
        logToTerminal('Использование: git merge <branch>');
        break;
      }
      const source = args[2];
      const target = repo.head.branch;
      if(!repo.branches[source]){
        logToTerminal(`Ветка ${source} не найдена`);
        break;
      }
      const sid = repo.branches[source].head;
      const tid = repo.branches[target].head;
      const mid = genId();
      repo.commits[mid] = {
        id: mid, 
        message: `Merge ${source} -> ${target}`, 
        parents: [tid, sid].filter(Boolean), 
        branch: target, 
        pos: {x: 0, y: 0}
      };
      repo.branches[target].head = mid;
      repo.head.commit = mid;
      saveCore();
      layout();
      render();
      logToTerminal(`Merge ${source} -> ${target}`);
      break;

    case 'log':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      logToTerminal('История коммитов:');
      Object.values(repo.commits).sort((a, b) => b.pos.x - a.pos.x).forEach(c => {
        const tags = Object.entries(repo.tags).filter(([name, tag]) => tag.commit === c.id).map(([name]) => name);
        const tagInfo = tags.length > 0 ? ` (tags: ${tags.join(', ')})` : '';
        logToTerminal(`${short(c.id)} ${c.message}${tagInfo}`);
      });
      break;

    case 'reset':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      if(args[2] === '--hard' && args[3]){
        const cid = args[3];
        if(!repo.commits[cid]){
          logToTerminal('Коммит не найден');
          break;
        }
        repo.head.commit = cid;
        if(repo.head.branch) {
          repo.branches[repo.head.branch].head = cid;
        }
        saveCore();
        layout();
        render();
        logToTerminal(`HEAD сброшен на ${short(cid)}`);
      } else {
        logToTerminal('Использование: git reset --hard <commit>');
      }
      break;

    case 'tag':
      if(!repo.initialized){
        logToTerminal('Репозиторий не инициализирован');
        break;
      }
      
      if(!args[2]) {
        const tags = Object.keys(repo.tags);
        if(tags.length === 0) {
          logToTerminal('Теги не созданы');
        } else {
          logToTerminal('Список тегов:');
          tags.forEach(tagName => {
            const tag = repo.tags[tagName];
            const type = tag.type === 'annotated' ? ' (annotated)' : '';
            logToTerminal(`  ${tagName}${type} -> ${short(tag.commit)}`);
          });
        }
      } 
      else if(args[2] === '-d' && args[3]) {
        if(deleteTag(args[3])) {
          logToTerminal(`Тег ${args[3]} удален`);
        }
      }
      else if(args[2] === '-a' && args[3]) {
        const msgIndex = args.indexOf('-m');
        if(msgIndex === -1 || !args[msgIndex + 1]){
          logToTerminal('Использование: git tag -a <name> -m "сообщение"');
          break;
        }
        const tagMessage = args.slice(msgIndex + 1).join(' ').replace(/^"|"$/g, '');
        if(createTag(args[3], 'annotated', tagMessage)) {
          logToTerminal(`Аннотированный тег ${args[3]} создан на коммите ${short(repo.head.commit)}`);
        }
      }
      else {
        if(createTag(args[2])) {
          logToTerminal(`Тег ${args[2]} создан на коммите ${short(repo.head.commit)}`);
        }
      }
      break;

    case 'help':
      showHelp();
      break;

    default:
      logToTerminal(`Неизвестная команда: git ${sub}`);
      logToTerminal('Введите "help" для списка команд');
  }
}

function setupTerminal() {
  termIn.addEventListener('keydown', function(e) {
    if(e.key === 'Enter') {
      const command = termIn.value.trim();
      if(command) {
        const commandLine = document.createElement('div');
        commandLine.className = 'terminal-line';
        commandLine.innerHTML = `<span class="prompt">$</span> <span>${command}</span>`;
        termOut.appendChild(commandLine);
        
        execCommand(command);
        
        termIn.value = '';
        
        termOut.scrollTop = termOut.scrollHeight;
      }
      e.preventDefault();
    }
  });

  document.getElementById('terminal').addEventListener('click', function() {
    termIn.focus();
  });

  setTimeout(() => {
    termIn.focus();
  }, 100);
}

let scale = 1, offsetX = 0, offsetY = 0, isPanning = false, startX = 0, startY = 0;
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = -e.deltaY * 0.002;
  scale = clamp(scale + delta, 0.3, 3);
  svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  zoomLabel.textContent = Math.round(scale * 100) + '%';
});

viewport.addEventListener('mousedown', e => {
  isPanning = true;
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
});

document.addEventListener('mouseup', e => {
  isPanning = false;
});

document.addEventListener('mousemove', e => {
  if(!isPanning) return;
  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;
  svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
});

clearRepoBtn.addEventListener('click', () => {
  if(confirm('Очистить репозиторий и удалить все коммиты?')){
    localStorage.removeItem('gitVisualizer_state');
    repo = {
      branches: {},
      commits: {},
      tags: {},
      head: { branch: null, commit: null },
      initialized: false
    };
    layout();
    render();
    logToTerminal('Репозиторий очищен.');
  }
});

loadCore();
layout();
render();

setupTerminal();

logToTerminal('Терминал готов. Введите команды Git, например: git init');
logToTerminal('Введите "help" для списка команд');