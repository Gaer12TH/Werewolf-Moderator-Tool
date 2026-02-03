// --- GAME STATE ---
let players = [];
let namePool = [];
let nightCount = 1;
let gameLog = [];
let currentPhase = 'setup';

let timerInterval;
let timeRemaining = 180;
let hunterPendingShot = null; // Track if hunter died and needs to shoot
let toughGuyBitten = false; // Track if Tough Guy was bitten last night
let cursedPlayers = []; // Track cursed players
let princeUsedPower = false; // Track if prince has used immunity
let cupidLovers = []; // Track Cupid's paired lovers [id1, id2]
let ghostLetters = ''; // Track Ghost's letters sent from beyond

// --- SOUND SYSTEM ---
let gameSounds = { night: null, day: null, death: null, vote: null };
let soundNames = { night: '', day: '', death: '', vote: '' };
let masterVolume = 100;
let isMuted = false;
let currentAudio = null;

// --- INIT ---
window.onload = function () {
    loadNamePool();
    checkSaveData();
    renderNamePool();
    loadSoundSettings();
    loadRolePresets();
}

// --- SOUND LOGIC ---
function loadSoundSettings() {
    try {
        const saved = localStorage.getItem('ww_mod_sounds');
        if (saved) {
            const settings = JSON.parse(saved);
            // Merge saved settings with defaults to ensure new keys (like 'vote') exist
            soundNames = { ...soundNames, ...(settings.names || {}) };
            masterVolume = settings.volume || 100;
            isMuted = settings.muted || false;

            // Load base64 sounds
            if (settings.sounds) {
                gameSounds = { ...gameSounds, ...settings.sounds };
            }
        }
        updateSoundUI();
    } catch (e) {
        console.error('Failed to load sounds:', e);
    }
}

function saveSoundSettings() {
    try {
        const settings = {
            names: soundNames,
            volume: masterVolume,
            muted: isMuted,
            sounds: gameSounds
        };
        localStorage.setItem('ww_mod_sounds', JSON.stringify(settings));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showNotification('⚠️ พื้นที่เต็ม! ไฟล์เสียงอาจใหญ่เกินไป', 'error');
        }
    }
}

function updateSoundUI() {
    const volDisplay = document.getElementById('volume-display');
    const volSlider = document.getElementById('master-volume');
    const muteBtn = document.getElementById('mute-btn');

    if (volDisplay) volDisplay.innerText = `${masterVolume}%`;
    if (volSlider) volSlider.value = masterVolume;

    if (muteBtn) {
        if (isMuted) {
            muteBtn.innerHTML = '<i class="fas fa-volume-mute mr-2"></i>เปิดเสียง';
            muteBtn.className = 'bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm';
        } else {
            muteBtn.innerHTML = '<i class="fas fa-volume-up mr-2"></i>ปิดเสียง';
            muteBtn.className = 'bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm';
        }
    }

    // Update names
    ['night', 'day', 'death', 'vote'].forEach(type => {
        const el = document.getElementById(`${type}-sound-name`);
        if (el) el.innerText = soundNames[type] || 'ยังไม่ได้เลือก';
    });
}

function closeSoundModal() {
    document.getElementById('sound-modal').classList.add('hidden');
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
}

function uploadSound(type, input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 3000000) { // Limit 3MB
            showNotification('⚠️ ไฟล์ใหญ่เกินไป (จำกัด 3MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            gameSounds[type] = e.target.result; // Base64
            soundNames[type] = file.name;
            saveSoundSettings();
            updateSoundUI();
            showNotification(`🎵 อัปโหลดเสียง ${type} สำเร็จ!`, 'success');
        };
        reader.readAsDataURL(file);
    }
}

function removeSound(type) {
    if (!gameSounds[type]) return;
    showConfirm(`ลบเสียง ${type}?`, () => {
        gameSounds[type] = null;
        soundNames[type] = '';
        saveSoundSettings();
        updateSoundUI();
        showNotification(`🗑️ ลบเสียงเรียบร้อย`, 'info');
    });
}

function playSound(type) {
    if (isMuted) return;
    if (!gameSounds[type]) {
        if (type !== 'vote') showNotification(`⚠️ ยังไม่ได้ตั้งค่าเสียง ${type}`, 'warning');
        return;
    }

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    try {
        const audio = new Audio(gameSounds[type]);
        audio.volume = masterVolume / 100;
        audio.play();
        currentAudio = audio;
    } catch (e) {
        console.error('Play error:', e);
    }
}

function toggleMute() {
    isMuted = !isMuted;
    if (currentAudio) currentAudio.pause();
    saveSoundSettings();
    updateSoundUI();
}

function updateVolume(val) {
    masterVolume = val;
    if (currentAudio) currentAudio.volume = masterVolume / 100;
    saveSoundSettings();
    updateSoundUI();
}

function testSound() {
    // Play a bip sound or just any set sound
    if (gameSounds['night']) playSound('night');
    else if (gameSounds['day']) playSound('day');
    else showNotification('⚠️ ยังไม่มีเสียงให้ทดสอบ', 'warning');
}

let rolePresets = {};

function loadRolePresets() {
    try {
        const saved = localStorage.getItem('ww_mod_presets');
        if (saved) {
            rolePresets = JSON.parse(saved);
            renderPresetOptions();
        }
    } catch (e) {
        console.error('Failed to load presets:', e);
    }
}

function saveRolePresets() {
    try {
        localStorage.setItem('ww_mod_presets', JSON.stringify(rolePresets));
    } catch (e) {
        console.error('Failed to save presets:', e);
    }
}

function savePreset() {
    if (players.length === 0) {
        showNotification('⚠️ ไม่มีบทบาทที่จะบันทึก\nกรุณาเพิ่มบทบาทก่อน', 'warning');
        return;
    }
    openPresetNameModal();
}

function openPresetNameModal() {
    const modal = document.getElementById('preset-name-modal');
    const input = document.getElementById('preset-name-input');
    modal.classList.remove('hidden');
    input.value = '';
    setTimeout(() => input.focus(), 100);
}

function closePresetNameModal() {
    document.getElementById('preset-name-modal').classList.add('hidden');
}

function confirmSavePreset() {
    const input = document.getElementById('preset-name-input');
    const name = input.value.trim();

    if (!name) {
        showNotification('⚠️ กรุณาใส่ชื่อชุดบทบาท', 'warning');
        return;
    }

    const roles = players.map(p => p.role);
    rolePresets[name] = roles;
    saveRolePresets();
    renderPresetOptions();
    closePresetNameModal();

    showNotification(`✅ บันทึกชุดบทบาท "${name}" สำเร็จ!\n(${roles.length} บทบาท)`, 'success');
}

function loadPreset() {
    const select = document.getElementById('preset-select');
    const name = select.value;

    if (!name) {
        showNotification('⚠️ กรุณาเลือกชุดบทบาทก่อน', 'warning');
        return;
    }

    const roles = rolePresets[name];
    if (!roles) {
        showNotification('⚠️ ไม่พบชุดบทบาทนี้', 'error');
        return;
    }

    // Clear current players and add preset roles
    players = [];
    roles.forEach(role => {
        players.push({ id: Date.now() + Math.random(), name: "", role, isAlive: true });
    });

    renderSetupList();
    saveGame();
    showNotification(`📋 โหลดชุดบทบาท "${name}" สำเร็จ!\n(${roles.length} บทบาท)`, 'success');
}

function deletePreset() {
    const select = document.getElementById('preset-select');
    const name = select.value;

    if (!name) {
        showNotification('⚠️ กรุณาเลือกชุดบทบาทที่จะลบ', 'warning');
        return;
    }

    showConfirm(`ลบชุดบทบาท "${name}" ?`, () => {
        delete rolePresets[name];
        saveRolePresets();
        renderPresetOptions();
        showNotification(`🗑️ ลบชุดบทบาท "${name}" แล้ว`, 'info');
    });
}

function renderPresetOptions() {
    const select = document.getElementById('preset-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- เลือกชุดบทบาท --</option>';
    Object.keys(rolePresets).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${rolePresets[name].length} คน)`;
        select.appendChild(option);
    });
}

// --- DRAW SYSTEM ---
let drawDeck = [];

const roleEmojis = {
    'Villager': '👨‍🌾', 'Seer': '🔮', 'Bodyguard': '🛡️', 'Spellcaster': '🤐', 'Cupid': '💘',
    'AuraSeer': '✨', 'Drunk': '🍺', 'Prince': '👑', 'Priest': '✝️', 'PI': '🕵️',
    'Troublemaker': '🤪', 'Witch': '🧙‍♀️', 'OldHag': '👵', 'ApprenticeSeer': '🎓', 'Mayor': '🎖️',
    'Hunter': '🔫', 'Disease': '🤢', 'Pacifist': '☮️', 'Ghost': '👻', 'Mason': '👷',
    'Doppelganger': '🎭', 'Lycan': '🐺', 'ToughGuy': '💪', 'Idiot': '🤪',
    'Werewolf': '🐺', 'LoneWolf': '🌑', 'WolfCub': '🐾', 'Minion': '😈', 'Sorcerer': '🦹‍♀️',
    'Hoodlum': '👊', 'Cursed': '🧟', 'SerialKiller': '🔪', 'Fool': '🃏', 'Medium': '🕯️'
};

const roleTeams = {
    'Werewolf': 'ฝั่งหมาป่า', 'LoneWolf': 'ฝั่งหมาป่า', 'WolfCub': 'ฝั่งหมาป่า',
    'Minion': 'ฝั่งหมาป่า', 'Sorcerer': 'ฝั่งหมาป่า',
    'SerialKiller': 'เป็นกลาง', 'Fool': 'เป็นกลาง', 'Hoodlum': 'เป็นกลาง'
};

function startDrawScreen() {
    if (players.length === 0) {
        showNotification('⚠️ กรุณาเพิ่มบทบาทก่อน', 'warning');
        return;
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('draw-screen').classList.remove('hidden');

    shuffleDrawCards();
}

function exitDrawScreen() {
    document.getElementById('draw-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

function shuffleDrawCards() {
    // Create deck from players
    drawDeck = players.map(p => p.role);

    // Fisher-Yates shuffle
    for (let i = drawDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [drawDeck[i], drawDeck[j]] = [drawDeck[j], drawDeck[i]];
    }

    renderDrawCards();
    showNotification('🔀 สับไพ่ใหม่แล้ว!', 'success');
}

function renderDrawCards() {
    const container = document.getElementById('draw-cards-container');
    const remaining = document.getElementById('cards-remaining');

    remaining.textContent = drawDeck.length;
    container.innerHTML = '';

    drawDeck.forEach((role, index) => {
        const card = document.createElement('div');
        card.className = 'aspect-[3/4] bg-gradient-to-br from-purple-800 to-indigo-900 rounded-xl border-2 border-purple-400/50 flex items-center justify-center cursor-pointer hover:scale-105 hover:border-purple-300 transition-all shadow-lg';
        card.innerHTML = `
            <div class="text-center">
                <div class="text-3xl mb-1">🎴</div>
                <div class="text-xs text-purple-300">#${index + 1}</div>
            </div>
        `;
        card.onclick = () => revealCard(index);
        container.appendChild(card);
    });
}

function revealCard(index) {
    if (index >= drawDeck.length) return;

    const role = drawDeck[index];
    const emoji = roleEmojis[role] || '❓';
    const team = roleTeams[role] || 'ฝั่งชาวบ้าน';

    document.getElementById('revealed-emoji').textContent = emoji;
    document.getElementById('revealed-role').textContent = getRoleThai(role);
    document.getElementById('revealed-team').textContent = team;

    // Remove card from deck
    drawDeck.splice(index, 1);

    // Show modal
    document.getElementById('card-reveal-modal').classList.remove('hidden');
}

function hideCardReveal() {
    document.getElementById('card-reveal-modal').classList.add('hidden');
    renderDrawCards();
}

function resetDrawCards() {
    shuffleDrawCards();
}

// Load sound settings from localStorage
function loadSoundSettings() {
    try {
        const saved = localStorage.getItem('ww_mod_sounds');
        if (saved) {
            const data = JSON.parse(saved);
            gameSounds = data.sounds || gameSounds;
            soundNames = data.names || soundNames;
            masterVolume = data.volume || 100;
            isMuted = data.muted || false;
            updateSoundUI();
        }
    } catch (e) {
        console.error('Failed to load sounds:', e);
    }
}

function saveSoundSettings() {
    try {
        localStorage.setItem('ww_mod_sounds', JSON.stringify({
            sounds: gameSounds,
            names: soundNames,
            volume: masterVolume,
            muted: isMuted
        }));
    } catch (e) {
        console.error('Failed to save sounds:', e);
        showNotification('⚠️ ไฟล์เสียงใหญ่เกินไป\nลองใช้ไฟล์ที่เล็กกว่า', 'error');
    }
}

function updateSoundUI() {
    // Update volume display
    const volumeDisplay = document.getElementById('volume-display');
    const volumeSlider = document.getElementById('master-volume');
    if (volumeDisplay) volumeDisplay.textContent = masterVolume + '%';
    if (volumeSlider) volumeSlider.value = masterVolume;

    // Update mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.innerHTML = isMuted ?
            '<i class="fas fa-volume-up mr-2"></i>เปิดเสียง' :
            '<i class="fas fa-volume-mute mr-2"></i>ปิดเสียง';
        muteBtn.className = isMuted ?
            'bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm' :
            'bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm';
    }

    // Update sound names
    ['night', 'day', 'death', 'vote'].forEach(type => {
        const nameEl = document.getElementById(type + '-sound-name');
        if (nameEl) nameEl.textContent = soundNames[type] || 'ยังไม่ได้เลือก';
    });
}

// Modal controls
function openSoundModal() {
    document.getElementById('sound-modal').classList.remove('hidden');
    updateSoundUI();
}

function closeSoundModal() {
    document.getElementById('sound-modal').classList.add('hidden');
}

// Volume control
function updateVolume(value) {
    masterVolume = parseInt(value);
    document.getElementById('volume-display').textContent = masterVolume + '%';
    saveSoundSettings();
}

function toggleMute() {
    isMuted = !isMuted;
    updateSoundUI();
    saveSoundSettings();
    showNotification(isMuted ? '🔇 ปิดเสียงแล้ว' : '🔊 เปิดเสียงแล้ว', 'info');
}

// Upload sound
function uploadSound(type, input) {
    const file = input.files[0];
    if (!file) return;

    // Check file size (max 2MB for localStorage)
    if (file.size > 2 * 1024 * 1024) {
        showNotification('⚠️ ไฟล์ใหญ่เกินไป (สูงสุด 2MB)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        gameSounds[type] = e.target.result;
        soundNames[type] = file.name;
        saveSoundSettings();
        updateSoundUI();
        showNotification(`✅ อัพโหลดเสียง "${file.name}" สำเร็จ!`, 'success');
    };
    reader.readAsDataURL(file);
}

// Play sound
function playSound(type) {
    if (isMuted) return;
    if (!gameSounds[type]) {
        showNotification('⚠️ ยังไม่ได้เลือกเสียง ' + type, 'warning');
        return;
    }

    // Stop current audio if playing
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    try {
        currentAudio = new Audio(gameSounds[type]);
        currentAudio.volume = masterVolume / 100;
        currentAudio.play().catch(e => console.error('Audio play failed:', e));
    } catch (e) {
        console.error('Failed to play sound:', e);
    }
}

// Remove sound
function removeSound(type) {
    gameSounds[type] = null;
    soundNames[type] = '';
    saveSoundSettings();
    updateSoundUI();
    showNotification('🗑️ ลบเสียงแล้ว', 'info');
}

// Test sound (play a beep)
function testSound() {
    if (isMuted) {
        showNotification('⚠️ เสียงถูกปิดอยู่', 'warning');
        return;
    }
    // Play first available sound or show message
    const types = ['night', 'day', 'death', 'vote'];
    for (const type of types) {
        if (gameSounds[type]) {
            playSound(type);
            return;
        }
    }
    showNotification('⚠️ ยังไม่มีเสียงที่อัพโหลด', 'warning');
}

function loadNamePool() {
    try {
        const storedNames = localStorage.getItem('ww_mod_names');
        if (storedNames) namePool = JSON.parse(storedNames);
    } catch (e) {
        console.error('Failed to load name pool:', e);
        namePool = [];
    }
}
function saveNamePool() {
    try {
        localStorage.setItem('ww_mod_names', JSON.stringify(namePool));
    } catch (e) {
        console.error('Failed to save name pool:', e);
        showNotification('⚠️ ไม่สามารถบันทึกข้อมูลได้\nกรุณาลองใหม่อีกครั้ง', 'error');
    }
}

function checkSaveData() {
    try {
        const save = localStorage.getItem('ww_mod_save');
        if (save) {
            document.getElementById('restore-prompt').classList.remove('hidden');
            document.getElementById('setup-screen').classList.add('hidden');
        }
    } catch (e) {
        console.error('Failed to check save data:', e);
    }
}

function confirmRestore() {
    try {
        const save = JSON.parse(localStorage.getItem('ww_mod_save'));
        players = save.players || [];
        nightCount = save.nightCount || 1;
        gameLog = save.gameLog || [];
        currentPhase = save.currentPhase || 'setup';

        document.getElementById('restore-prompt').classList.add('hidden');

        if (currentPhase === 'night') {
            document.getElementById('night-screen').classList.remove('hidden');
            renderNightActions();
        } else if (currentPhase === 'day') {
            document.getElementById('day-screen').classList.remove('hidden');
            document.getElementById('death-result').innerHTML = "<span class='text-yellow-400 font-bold'>กู้คืนเกมสำเร็จ!</span><br>เชิญดำเนินเกมต่อ...";
            document.getElementById('alive-count').innerText = players.filter(p => p.isAlive).length;
        } else {
            document.getElementById('setup-screen').classList.remove('hidden');
            renderSetupList();
        }
    } catch (e) {
        console.error('Failed to restore game:', e);
        showNotification('⚠️ ไม่สามารถกู้คืนเกมได้\nกรุณาเริ่มเกมใหม่', 'error');
        discardSave();
    }
}

function discardSave() {
    try {
        localStorage.removeItem('ww_mod_save');
        location.reload();
    } catch (e) {
        console.error('Failed to discard save:', e);
    }
}
function clearSaveData() {
    if (confirm('เริ่มเกมใหม่?')) {
        try {
            localStorage.removeItem('ww_mod_save');
            location.reload();
        } catch (e) {
            console.error('Failed to clear save:', e);
        }
    }
}
function saveGame() {
    try {
        localStorage.setItem('ww_mod_save', JSON.stringify({ players, nightCount, gameLog, currentPhase }));
    } catch (e) {
        console.error('Failed to save game:', e);
        showNotification('⚠️ ไม่สามารถบันทึกเกมได้\nข้อมูลอาจสูญหาย', 'error');
    }
}
function addLog(phase, event) { gameLog.push({ phase, event, time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }); }

// --- POOL ---
function handlePoolEnter(e) { if (e.key === 'Enter') addNameToPool(); }
function addNameToPool() {
    const input = document.getElementById('pool-input-name');
    const name = input.value.trim();
    if (name && !namePool.includes(name)) {
        namePool.push(name);
        saveNamePool();
        renderNamePool();
        input.value = '';
    } else if (namePool.includes(name)) {
        showNotification('⚠️ ชื่อนี้มีอยู่แล้ว', 'warning');
    }
}
function removeNameFromPool(name) { namePool = namePool.filter(n => n !== name); saveNamePool(); renderNamePool(); }
function clearNamePool() {
    showConfirm('ยืนยันลบรายชื่อทั้งหมดหรือไม่?', () => {
        namePool = [];
        saveNamePool();
        renderNamePool();
    });
}
function renderNamePool() {
    const list = document.getElementById('name-pool-list');
    if (namePool.length === 0) {
        list.innerHTML = '<span class="text-gray-500 text-xs italic w-full text-center">ว่างเปล่า...</span>';
        return;
    }
    // Clear existing content
    list.innerHTML = '';
    // Create elements safely to prevent XSS
    namePool.forEach(name => {
        const span = document.createElement('span');
        span.className = 'bg-gray-800 text-gray-200 px-3 py-1 rounded-lg text-xs flex items-center gap-2 border border-gray-600 shadow-sm';

        const nameText = document.createTextNode(name);
        span.appendChild(nameText);

        const btn = document.createElement('button');
        btn.className = 'text-red-400 hover:text-red-200';
        btn.innerHTML = '<i class="fas fa-times"></i>';
        btn.onclick = () => removeNameFromPool(name);

        span.appendChild(btn);
        list.appendChild(span);
    });
}

// --- SETUP ---
function addRole() {
    const role = document.getElementById('input-role').value;
    players.push({ id: Date.now(), name: "", role, isAlive: true });
    renderSetupList();
    saveGame();
}
function removePlayer(id) { players = players.filter(p => p.id !== id); renderSetupList(); saveGame(); }
function renderSetupList() {
    const list = document.getElementById('player-list');
    document.getElementById('role-count-badge').innerText = players.length;
    if (players.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 text-sm py-6 border-2 border-dashed border-gray-700/50 rounded-xl bg-black/20">ยังไม่ได้เลือกบทบาท</div>';
        return;
    }
    list.innerHTML = players.map((p, index) => `
                <div class="flex justify-between items-center bg-gray-800/80 p-3 rounded-xl border-l-4 ${getRoleColorBorder(p.role)} mb-2 shadow-md border-t border-r border-b border-gray-700/50 backdrop-blur-sm">
                    <div class="flex items-center gap-3">
                        <span class="bg-gray-900 text-gray-400 rounded-lg w-7 h-7 flex items-center justify-center text-xs font-mono font-bold border border-gray-700">${index + 1}</span>
                        <div>
                            <span class="font-bold text-gray-200 block">${getRoleThai(p.role)}</span>
                        </div>
                    </div>
                    <button onclick="removePlayer(${p.id})" class="w-8 h-8 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"><i class="fas fa-trash-alt text-xs"></i></button>
                </div>
            `).join('');
}

// --- HELPER STYLES ---
function getRoleColorBorder(role) {
    const redTeam = ['Werewolf', 'LoneWolf', 'WolfCub', 'Minion', 'Sorcerer'];
    const special = ['Seer', 'AuraSeer', 'Spellcaster', 'Witch', 'Cupid'];
    if (redTeam.includes(role)) return 'border-red-600';
    if (special.includes(role)) return 'border-blue-400';
    if (role === 'Bodyguard') return 'border-green-500';
    if (role === 'SerialKiller') return 'border-red-800';
    return 'border-gray-500';
}

function getRoleThai(role) {
    const map = {
        'Villager': 'ชาวบ้าน', 'Seer': 'เทพพยากรณ์', 'Bodyguard': 'บอดี้การ์ด', 'Spellcaster': 'จอมเวท', 'Cupid': 'กามเทพ',
        'AuraSeer': 'ญาณทิพย์', 'Drunk': 'ขี้เมา', 'Prince': 'เจ้าชาย', 'Priest': 'นักบวช', 'PI': 'นักสืบ',
        'Troublemaker': 'ตัวป่วน', 'Witch': 'แม่มด', 'OldHag': 'แม่หมอ', 'ApprenticeSeer': 'ศิษย์เทพฯ', 'Mayor': 'นายกฯ',
        'Hunter': 'นายพราน', 'Disease': 'ผู้ติดเชื้อ', 'Pacifist': 'ผู้รักสันติ', 'Ghost': 'พรายกระซิบ', 'Mason': 'ภราดร',
        'Doppelganger': 'ภูตจำแลง', 'Lycan': 'ลูกครึ่ง', 'ToughGuy': 'หนุ่มถึก', 'Idiot': 'ไอ้ทึ่ม',
        'Werewolf': 'หมาป่า', 'LoneWolf': 'หมาป่าเดียวดาย', 'WolfCub': 'ลูกหมาป่า', 'Minion': 'สมุน', 'Sorcerer': 'นางปีศาจ',
        'Hoodlum': 'อันธพาล', 'Cursed': 'ผู้ต้องคำสาป', 'SerialKiller': 'ฆาตกร', 'Fool': 'คนบ้า', 'Medium': 'คนทรง'
    };
    return map[role] || role;
}

function startGame() {
    if (players.length < 3) return showNotification('⚠️ ต้องมีผู้เล่นอย่างน้อย 3 คน', 'warning');
    if (players.length > namePool.length) return showNotification(`⚠️ มีบทบาท ${players.length} คน แต่มีชื่อในรายชื่อเพียง ${namePool.length} ชื่อ\n\nโปรดเพิ่มชื่อให้เพียงพอก่อนเริ่มเกม`, 'warning');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('night-screen').classList.remove('hidden');
    currentPhase = 'night';
    renderNightActions();
    saveGame();
}

// --- NIGHT LOGIC ---
function renderNightActions() {
    const container = document.getElementById('night-actions-container');
    container.innerHTML = '';
    document.getElementById('night-count').innerText = nightCount;
    const btn = document.getElementById('night-action-btn');

    // NIGHT 1
    if (nightCount === 1) {
        btn.innerHTML = `เริ่มเกม! (Day 1) <i class="fas fa-sun ml-2"></i>`;
        document.getElementById('note-section').classList.add('hidden');
        const nameOptions = `<option value="">-- เลือกชื่อผู้เล่น --</option>` + namePool.map(n => `<option value="${n}">${n}</option>`).join('');

        container.innerHTML = `
                    <div class="text-center mb-6">
                        <div class="inline-block p-3 rounded-full bg-yellow-500/20 mb-2 border border-yellow-500/30">
                            <i class="fas fa-id-card text-2xl text-yellow-400"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white">จับคู่ผู้เล่น</h3>
                        <p class="text-gray-400 text-xs">ระบุตัวตนให้ตรงกับบทบาท</p>
                    </div>
                ` + players.map((p, index) => `
                    <div class="bg-gray-800/60 p-3 rounded-xl border border-gray-600 mb-3 flex items-center gap-3 shadow-lg">
                        <div class="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center font-bold text-gray-500 shrink-0 border border-gray-700">
                            ${index + 1}
                        </div>
                        <div class="flex-1">
                            <label class="text-xs text-blue-300 block mb-1 font-bold uppercase tracking-wider">${getRoleThai(p.role)}</label>
                            <div class="relative">
                                <select id="name-${p.id}" class="w-full appearance-none bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500" onchange="updateName(${p.id}, this.value)">
                                    ${nameOptions}
                                </select>
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');

        setTimeout(() => { players.forEach(p => { const sel = document.getElementById(`name-${p.id}`); if (sel && p.name) sel.value = p.name; }); }, 0);
        return;
    }

    // NIGHT 2+
    btn.innerHTML = `สรุปผลตอนเช้า <i class="fas fa-sun ml-2"></i>`;
    document.getElementById('note-section').classList.remove('hidden');

    const alivePlayers = players.filter(p => p.isAlive);
    const options = `<option value="">-- เลือกเป้าหมาย --</option>` + alivePlayers.map(p => `<option value="${p.id}">${p.name} (${getRoleThai(p.role)})</option>`).join('');

    // Minion Notification
    alivePlayers.forEach(p => {
        if (p.role === 'Minion') {
            const wolves = players.filter(w => ['Werewolf', 'LoneWolf', 'WolfCub'].includes(w.role) && w.isAlive).map(w => w.name).join(', ');
            const div = document.createElement('div');
            div.className = `p-4 bg-gradient-to-br from-red-950 to-red-900/80 rounded-xl border border-red-600/50 mb-3 shadow-lg`;
            div.innerHTML = `
                        <label class="block text-red-300 font-bold mb-2 text-sm"><i class="fas fa-eye mr-2 text-red-500"></i>สมุนรับใช้ (รู้ตัว)</label>
                        <div class="bg-black/40 p-2 rounded-lg border border-red-600/30 text-sm text-red-200">
                            <strong>หมาป่า:</strong> ${wolves || 'ไม่มี'}
                        </div>
                    `;
            container.appendChild(div);
        }
    });

    const createAction = (id, label, icon, color, gradient, customOptions = null) => {
        const div = document.createElement('div');
        div.className = `p-4 bg-gradient-to-br ${gradient} rounded-xl border border-${color}-500/30 mb-3 shadow-lg relative overflow-hidden group`;
        div.innerHTML = `
                    <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <i class="${icon} text-4xl text-white"></i>
                    </div>
                    <label class="block text-white font-bold mb-2 text-sm flex items-center gap-2">
                        <i class="${icon} text-${color}-300"></i> ${label}
                    </label>
                    <div class="relative">
                        <select id="${id}" class="w-full appearance-none bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:border-${color}-400 focus:outline-none focus:bg-black/60 transition-colors">
                            ${customOptions || options}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                            <i class="fas fa-chevron-down text-xs"></i>
                        </div>
                    </div>
                `;
        return div;
    };

    // Night 2 Actions
    if (nightCount === 2) {
        if (players.some(p => p.role === 'Cupid')) {
            const div = document.createElement('div');
            div.className = `p-4 bg-gradient-to-br from-pink-900/80 to-rose-900/80 rounded-xl border border-pink-500/30 mb-3 shadow-lg`;
            div.innerHTML = `
                        <label class="block text-pink-200 font-bold mb-2 text-sm"><i class="fas fa-heart mr-2 text-pink-400"></i>กามเทพ (จับคู่รัก)</label>
                        <div class="flex gap-2">
                            <select id="cupid-1" class="w-1/2 bg-black/40 border border-white/20 rounded-lg px-2 py-2 text-white text-sm">${options}</select>
                            <select id="cupid-2" class="w-1/2 bg-black/40 border border-white/20 rounded-lg px-2 py-2 text-white text-sm">${options}</select>
                        </div>
                        <div class="text-xs text-pink-300 mt-2 opacity-70"><i class="fas fa-info-circle mr-1"></i>คู่รักจะตายตามกัน</div>
                    `;
            container.appendChild(div);

            // Save Cupid targets
            setTimeout(() => {
                const c1 = document.getElementById('cupid-1');
                const c2 = document.getElementById('cupid-2');
                if (c1 && c2) {
                    const saveCupidTargets = () => {
                        if (c1.value && c2.value && c1.value !== c2.value) {
                            cupidLovers = [c1.value, c2.value];
                            saveGame();
                        }
                    };
                    c1.addEventListener('change', saveCupidTargets);
                    c2.addEventListener('change', saveCupidTargets);
                }
            }, 0);
        }
        if (players.some(p => p.role === 'Hoodlum')) {
            const div = document.createElement('div');
            div.className = `p-4 bg-gray-800 rounded-xl border border-gray-500/30 mb-3`;
            div.innerHTML = `
                        <label class="block text-gray-300 font-bold mb-2 text-sm"><i class="fas fa-fist-raised mr-2"></i>อันธพาล (เหยื่อ)</label>
                        <div class="flex gap-2">
                            <select id="hoodlum-1" class="w-1/2 bg-black/40 border border-white/20 rounded-lg px-2 py-2 text-white text-sm">${options}</select>
                            <select id="hoodlum-2" class="w-1/2 bg-black/40 border border-white/20 rounded-lg px-2 py-2 text-white text-sm">${options}</select>
                        </div>
                    `;
            container.appendChild(div);

            // Track selections
            setTimeout(() => {
                const h1 = document.getElementById('hoodlum-1');
                const h2 = document.getElementById('hoodlum-2');
                if (h1 && h2) {
                    const saveHoodlumTargets = () => {
                        const hoodlum = players.find(p => p.role === 'Hoodlum');
                        if (hoodlum && h1.value && h2.value) {
                            hoodlum.hoodlumTargets = [h1.value, h2.value];
                            saveGame();
                        }
                    };
                    h1.addEventListener('change', saveHoodlumTargets);
                    h2.addEventListener('change', saveHoodlumTargets);

                    // Restore previous selections if any
                    const hoodlum = players.find(p => p.role === 'Hoodlum');
                    if (hoodlum && hoodlum.hoodlumTargets) {
                        h1.value = hoodlum.hoodlumTargets[0] || '';
                        h2.value = hoodlum.hoodlumTargets[1] || '';
                    }
                }
            }, 0);
        }
        if (players.some(p => p.role === 'Doppelganger')) {
            container.appendChild(createAction('doppel-target', 'ภูตจำแลง (ลอกเลียน)', 'fas fa-user-secret', 'purple', 'from-purple-900/80 to-indigo-900/80'));

            // Save Doppel target
            setTimeout(() => {
                const doppelSelect = document.getElementById('doppel-target');
                if (doppelSelect) {
                    doppelSelect.addEventListener('change', function () {
                        const doppel = players.find(p => p.role === 'Doppelganger');
                        if (doppel) {
                            doppel.doppelTarget = this.value;
                            saveGame();
                        }
                    });
                }
            }, 100);
        }

        // Mason list display (Night 2 only)
        const masons = players.filter(p => p.role === 'Mason' && p.isAlive);
        if (masons.length > 1) {
            const div = document.createElement('div');
            div.className = 'p-4 bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl border border-gray-500/30 mb-3 shadow-lg';
            div.innerHTML = `
                        <label class="block text-gray-200 font-bold mb-2 text-sm"><i class="fas fa-handshake mr-2"></i>ภราดรแห่งเมสัน (รู้จักกัน)</label>
                        <div class="bg-black/40 p-3 rounded-lg border border-gray-500/30">
                            <div class="text-sm text-gray-300 space-y-1">
                                ${masons.map(m => `<div>👷 <strong>${m.name}</strong></div>`).join('')}
                            </div>
                        </div>
                    `;
            container.appendChild(div);
        }

        // Drunk reveal at night 3
        const drunk = players.find(p => p.role === 'Drunk' && p.isAlive);
        if (drunk && nightCount === 3) {
            const div = document.createElement('div');
            div.className = 'p-4 bg-gradient-to-br from-amber-900/80 to-yellow-900/80 rounded-xl border border-amber-500/30 mb-3 shadow-lg';
            div.innerHTML = `
                <label class="block text-amber-300 font-bold mb-2 text-sm"><i class="fas fa-wine-glass mr-2 text-amber-400"></i>ขี้เมาตื่น!</label>
                <div class="bg-black/40 p-3 rounded-lg border border-amber-500/30 text-sm text-amber-200">
                    🍺 <strong>${drunk.name}</strong> รู้บทบาทจริงของตัวเองแล้ว!<br>
                    <span class="text-gray-400">(บอกผู้เล่นว่าเขาเป็นอะไรจริงๆ)</span>
                </div>
            `;
            container.appendChild(div);
            showNotification(`🍺 ${drunk.name} ตื่นแล้ว!\n\nบอกบทบาทจริงให้เขาฟัง`, 'warning');
        }

        // Lycan info reminder
        const lycan = players.find(p => p.role === 'Lycan' && p.isAlive);
        if (lycan) {
            const div = document.createElement('div');
            div.className = 'p-4 bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl border border-gray-500/30 mb-3 shadow-lg';
            div.innerHTML = `
                <label class="block text-gray-300 font-bold mb-2 text-sm"><i class="fas fa-moon mr-2 text-gray-400"></i>Lycan Info</label>
                <div class="bg-black/40 p-3 rounded-lg border border-gray-500/30 text-sm text-gray-300">
                    🐺 <strong>${lycan.name}</strong> เป็นลูกครึ่ง<br>
                    <span class="text-yellow-400">⚠️ เทพพยากรณ์จะเห็นว่าเป็นหมาป่า!</span>
                </div>
            `;
            container.appendChild(div);
        }

        // Aura Seer - detect special vs normal
        const auraSeer = players.find(p => p.role === 'AuraSeer' && p.isAlive);
        if (auraSeer) {
            const div = document.createElement('div');
            div.className = 'p-4 bg-gradient-to-br from-cyan-900/80 to-teal-900/80 rounded-xl border border-cyan-500/30 mb-3 shadow-lg';
            div.innerHTML = `
                <label class="block text-cyan-300 font-bold mb-2 text-sm"><i class="fas fa-eye mr-2 text-cyan-400"></i>ญาณทิพย์ (ดูออร่า)</label>
                <div class="relative">
                    <select id="auraseer-target" class="w-full appearance-none bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none">
                        ${options}
                    </select>
                    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                        <i class="fas fa-chevron-down text-xs"></i>
                    </div>
                </div>
            `;
            container.appendChild(div);

            // Add event listener for Aura Seer result
            setTimeout(() => {
                const auraSeerSelect = document.getElementById('auraseer-target');
                if (auraSeerSelect) {
                    auraSeerSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                // SPECIAL = ไม่ใช่หมาป่า และ ไม่ใช่ชาวบ้านธรรมดา (มีพลังพิเศษ)
                                // ตามกติกา: "ไม่ใช่ทั้งมนุษย์ป่าหมาป่าหรือชาวบ้านธรรมดา เช่น นายพราน"
                                const normalRoles = ['Villager', 'Werewolf', 'LoneWolf', 'WolfCub', 'Lycan', 'Cursed', 'Mason', 'Minion'];
                                // Everyone else is SPECIAL (has special abilities)

                                const isSpecial = !normalRoles.includes(target.role);
                                const resultMsg = isSpecial ?
                                    `✨ ญาณทิพย์\n\n${target.name}\n⭐ มีออร่าพิเศษ` :
                                    `✨ ญาณทิพย์\n\n${target.name}\n👤 เป็นคนธรรมดา`;
                                showNotification(resultMsg, isSpecial ? 'warning' : 'info');
                            }
                        }
                    });
                }
            }, 100);
        }
    }

    // Recurring Actions
    const hasWolf = players.some(p => ['Werewolf', 'LoneWolf', 'WolfCub'].includes(p.role) && p.isAlive);

    // Check if wolf should skip this night (Disease mechanic)
    if (window.wolfSkipNextNight) {
        const div = document.createElement('div');
        div.className = 'p-4 bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl border border-yellow-500/30 mb-3 shadow-lg';
        div.innerHTML = `
                    <label class="block text-yellow-300 font-bold mb-2 text-sm"><i class="fas fa-ban mr-2"></i>หมาป่างดฆ่า (Disease)</label>
                    <div class="bg-black/40 p-3 rounded-lg border border-yellow-500/30 text-sm text-yellow-200">
                        คืนนี้หมาป่าป่วยจาก Disease ไม่สามารถฆ่าได้
                    </div>
                `;
        container.appendChild(div);
        window.wolfSkipNextNight = false; // Reset flag
    } else if (hasWolf) {
        const wolfOptions = `<option value="">-- เลือกเป้าหมาย --</option>` + alivePlayers.filter(p => !['Werewolf', 'LoneWolf', 'WolfCub'].includes(p.role)).map(p => `<option value="${p.id}">${p.name} (${getRoleThai(p.role)})</option>`).join('');
        container.appendChild(createAction('wolf-target', 'หมาป่า (เหยื่อ)', 'fas fa-skull', 'red', 'from-red-900/80 to-rose-900/80', wolfOptions));
    }

    alivePlayers.forEach(p => {
        if (p.role === 'Seer' || p.role === 'ApprenticeSeer') {
            container.appendChild(createAction('seer-target', 'ผู้หยั่งรู้ (ส่อง)', 'fas fa-eye', 'blue', 'from-blue-900/80 to-cyan-900/80'));
            // Add event listener to show result when target is selected
            setTimeout(() => {
                const seerSelect = document.getElementById('seer-target');
                if (seerSelect) {
                    seerSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                const isWerewolf = ['Werewolf', 'LoneWolf', 'WolfCub'].includes(target.role);
                                const isLycan = target.role === 'Lycan';

                                let message, type;
                                if (isLycan) {
                                    message = `🔮 ${target.name}\n\nดูเหมือนหมาป่า! 🐺\n(แต่จริงๆ เป็น Lycan - ชาวบ้าน)`;
                                    type = 'warning';
                                } else if (isWerewolf) {
                                    message = `🔮 ${target.name}\n\nเป็นหมาป่า! 🐺`;
                                    type = 'error';
                                } else {
                                    message = `🔮 ${target.name}\n\nเป็นชาวบ้าน ✅`;
                                    type = 'success';
                                }
                                showNotification(message, type);
                            }
                        }
                    });
                }
            }, 100);
        }
        if (p.role === 'AuraSeer') {
            container.appendChild(createAction('aura-target', 'ญาณทิพย์ (ส่อง)', 'fas fa-eye', 'cyan', 'from-cyan-900/80 to-teal-900/80'));
            // Aura Seer - checks if special role or normal villager
            setTimeout(() => {
                const auraSelect = document.getElementById('aura-target');
                if (auraSelect) {
                    auraSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                const specialRoles = ['Seer', 'Witch', 'Bodyguard', 'Hunter', 'Prince', 'AuraSeer', 'Cupid', 'SerialKiller', 'Fool', 'Hoodlum', 'Sorcerer', 'ToughGuy', 'Priest', 'Medium'];
                                const isSpecial = specialRoles.includes(target.role);
                                let message, type;
                                if (isSpecial) {
                                    message = `👁️ ${target.name}\n\nเป็นตัวละครพิเศษ! ✨`;
                                    type = 'warning';
                                } else {
                                    message = `👁️ ${target.name}\n\nเป็นตัวละครธรรมดา 👤`;
                                    type = 'info';
                                }
                                showNotification(message, type);
                            }
                        }
                    });
                }
            }, 100);
        }
        if (p.role === 'Sorcerer') {
            container.appendChild(createAction('sorc-target', 'นางปีศาจ (หาเทพ)', 'fas fa-magic', 'purple', 'from-purple-900/80 to-fuchsia-900/80'));
            // Sorcerer event listener to check if target is Seer
            setTimeout(() => {
                const sorcSelect = document.getElementById('sorc-target');
                if (sorcSelect) {
                    sorcSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                const isSeer = ['Seer', 'ApprenticeSeer'].includes(target.role);
                                let message, type;
                                if (isSeer) {
                                    message = `🔮 ${target.name}\n\nเป็นเทพพยากรณ์! 👁️\n(บอกหมาป่าเลย!)`;
                                    type = 'success';
                                } else {
                                    message = `🔮 ${target.name}\n\nไม่ใช่เทพพยากรณ์ ❌`;
                                    type = 'error';
                                }
                                showNotification(message, type);
                            }
                        }
                    });
                }
            }, 100);
        }
        if (p.role === 'Bodyguard') container.appendChild(createAction('guard-target', 'บอดี้การ์ด (กัน)', 'fas fa-shield-alt', 'green', 'from-green-900/80 to-emerald-900/80'));
        if (p.role === 'Priest') container.appendChild(createAction('priest-target', 'นักบวช (คุ้มครอง)', 'fas fa-cross', 'gray', 'from-gray-800 to-gray-700'));
        if (p.role === 'SerialKiller') container.appendChild(createAction('sk-target', 'ฆาตกร (ฆ่า)', 'fas fa-knife', 'red', 'from-red-950 to-red-900'));

        // PI - check 3 players (Night 2 only, once per game)
        if (p.role === 'PI' && nightCount === 2) {
            container.appendChild(createAction('pi-target', 'นักสืบ (ตรวจ 3 คน)', 'fas fa-magnifying-glass', 'orange', 'from-orange-900/80 to-amber-900/80'));
            setTimeout(() => {
                const piSelect = document.getElementById('pi-target');
                if (piSelect) {
                    piSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const targetIndex = alivePlayers.findIndex(p => p.id == targetId);
                            if (targetIndex >= 0) {
                                // Get left, center, right players
                                const checkPlayers = [];
                                const len = alivePlayers.length;
                                checkPlayers.push(alivePlayers[(targetIndex - 1 + len) % len]); // left
                                checkPlayers.push(alivePlayers[targetIndex]); // center
                                checkPlayers.push(alivePlayers[(targetIndex + 1) % len]); // right

                                const hasWolf = checkPlayers.some(p => ['Werewolf', 'LoneWolf', 'WolfCub'].includes(p.role));
                                const names = checkPlayers.map(p => p.name).join(', ');

                                if (hasWolf) {
                                    showNotification(`🕵️ นักสืบ\n\nตรวจ: ${names}\n\n🐺 มีหมาป่าอยู่ในกลุ่มนี้!`, 'error');
                                } else {
                                    showNotification(`🕵️ นักสืบ\n\nตรวจ: ${names}\n\n✅ ไม่มีหมาป่าในกลุ่มนี้`, 'success');
                                }
                                addLog(`Night ${nightCount}`, `PI ตรวจ ${names} - ${hasWolf ? 'มีหมาป่า' : 'ไม่มี'}`);
                            }
                        }
                    });
                }
            }, 100);
        }

        // Old Hag - exile player for 1 day
        if (p.role === 'OldHag') {
            container.appendChild(createAction('oldhag-target', 'แม่หมอ (ไล่ออก)', 'fas fa-hand-point-right', 'amber', 'from-amber-900/80 to-orange-900/80'));
            setTimeout(() => {
                const hagSelect = document.getElementById('oldhag-target');
                if (hagSelect) {
                    hagSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                target.exiled = true; // Track exiled status
                                showNotification(`👵 แม่หมอ\n\n${target.name} ถูกไล่ออกจากหมู่บ้าน\n⛔ วันนี้ห้ามโหวต และจะไม่ถูกฆ่า`, 'warning');
                                addLog(`Night ${nightCount}`, `Old Hag ไล่ ${target.name} ออก`);
                                saveGame();
                            }
                        }
                    });
                }
            }, 100);
        }
        if (p.role === 'Hunter' && nightCount > 1) {
            const div = document.createElement('div');
            div.className = `p-4 bg-gradient-to-br from-amber-900/80 to-yellow-900/80 rounded-xl border border-amber-500/30 mb-3 shadow-lg`;
            div.innerHTML = `
                        <label class="block text-amber-300 font-bold mb-2 text-sm"><i class="fas fa-gun mr-2 text-amber-400"></i>นายพราน (ยิง)</label>
                        <div class="flex items-center bg-black/20 p-2 rounded-lg border border-white/10">
                            <input type="checkbox" id="hunter-shot" class="w-5 h-5 mr-3 accent-amber-500">
                            <label for="hunter-shot" class="text-sm text-gray-300 font-bold">ยิงผู้เล่นออก 1 คนในวันนี้</label>
                        </div>
                        <select id="hunter-target" class="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm mt-2 disabled:opacity-50" disabled>${options}</select>
                    `;
            const script = document.createElement('script');
            script.textContent = `document.getElementById('hunter-shot').addEventListener('change', function() { document.getElementById('hunter-target').disabled = !this.checked; });`;
            div.appendChild(script);
            container.appendChild(div);
        }
        if (p.role === 'Witch') {
            const div = document.createElement('div');
            div.className = `p-4 bg-gradient-to-br from-indigo-900/80 to-violet-900/80 rounded-xl border border-indigo-500/30 mb-3 shadow-lg`;
            div.innerHTML = `
                        <label class="block text-indigo-300 font-bold mb-2 text-sm"><i class="fas fa-flask mr-2 text-indigo-400"></i>แม่มด</label>
                        <select id="witch-kill" class="w-full bg-black/40 border border-white/20 rounded-lg px-2 py-2 text-white text-sm mb-2">${options.replace('-- เลือกเป้าหมาย --', '💀 ยาพิษ (ฆ่าใคร)')}</select>
                        <div class="flex items-center bg-black/20 p-2 rounded-lg border border-white/10">
                            <input type="checkbox" id="witch-save" class="w-5 h-5 mr-3 accent-green-500">
                            <label for="witch-save" class="text-sm text-gray-300 font-bold">🧪 ใช้ยาชุบชีวิตคืนนี้</label>
                        </div>
                    `;
            container.appendChild(div);
        }
        if (p.role === 'Spellcaster') {
            container.appendChild(createAction('spell-target', 'จอมเวท (ใบ้)', 'fas fa-comment-slash', 'pink', 'from-pink-900/80 to-purple-900/80'));
            setTimeout(() => {
                const spellSelect = document.getElementById('spell-target');
                if (spellSelect) {
                    spellSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                showNotification(`🤐 ${target.name} ถูกสาป!\n\nห้ามพูดในวันพรุ่งนี้`, 'warning');
                                addLog(`Night ${nightCount}`, `Spellcaster สาป ${target.name}`);
                            }
                        }
                    });
                }
            }, 100);
        }
        if (p.role === 'OldHag') {
            container.appendChild(createAction('hag-target', 'แม่หมอ (ไล่)', 'fas fa-door-open', 'slate', 'from-slate-800 to-slate-700'));
            setTimeout(() => {
                const hagSelect = document.getElementById('hag-target');
                if (hagSelect) {
                    hagSelect.addEventListener('change', function () {
                        const targetId = this.value;
                        if (targetId) {
                            const target = players.find(p => p.id == targetId);
                            if (target) {
                                showNotification(`🚪 ${target.name} ถูกไล่!\n\nห้ามโหวต + ห้ามพูดวันนี้`, 'warning');
                                addLog(`Night ${nightCount}`, `Old Hag ไล่ ${target.name}`);
                            }
                        }
                    });
                }
            }, 100);
        }
        // 5. Medium - view dead role
        if (p.role === 'Medium') {
            const deadPlayers = players.filter(p => !p.isAlive);
            if (deadPlayers.length > 0) {
                const deadOptions = `<option value="">-- เลือกดูผู้ตาย --</option>` + deadPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                const div = document.createElement('div');
                div.className = 'p-4 bg-gradient-to-br from-indigo-900/80 to-purple-900/80 rounded-xl border border-indigo-500/30 mb-3 shadow-lg';
                div.innerHTML = `
                            <label class="block text-indigo-300 font-bold mb-2 text-sm"><i class="fas fa-ghost mr-2 text-indigo-400"></i>คนทรง (ดูผู้ตาย)</label>
                            <div class="relative">
                                <select id="medium-target" class="w-full appearance-none bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none">
                                    ${deadOptions}
                                </select>
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </div>
                            </div>
                        `;
                container.appendChild(div);

                // Add event listener to show dead role
                setTimeout(() => {
                    const mediumSelect = document.getElementById('medium-target');
                    if (mediumSelect) {
                        mediumSelect.addEventListener('change', function () {
                            const targetId = this.value;
                            if (targetId) {
                                const deadPlayer = players.find(p => p.id == targetId);
                                if (deadPlayer) {
                                    showNotification(
                                        `🕯️ คนทรง\n\nผู้ตาย: ${deadPlayer.name}\nบทบาท: ${getRoleThai(deadPlayer.role)}`,
                                        'info'
                                    );
                                }
                            }
                        });
                    }
                }, 100);
            }
        }
        if (p.role === 'Troublemaker' && nightCount > 1) {
            const div = document.createElement('div');
            div.className = `p-4 bg-gradient-to-br from-orange-900/80 to-red-900/80 rounded-xl border border-orange-500/30 mb-3 shadow-lg`;
            div.innerHTML = `
                        <label class="block text-orange-300 font-bold mb-2 text-sm"><i class="fas fa-random mr-2 text-orange-400"></i>ตัวป่วน (ป่วน)</label>
                        <div class="flex items-center bg-black/20 p-2 rounded-lg border border-white/10">
                            <input type="checkbox" id="trouble-check" class="w-5 h-5 mr-3 accent-orange-500">
                            <label for="trouble-check" class="text-sm text-gray-300 font-bold">ทำให้มีการโหวตออก 2 คนในวันนี้</label>
                        </div>
                    `;
            container.appendChild(div);

            // === PHASE 2: Troublemaker reminder ===
            setTimeout(() => {
                const troubleCheckbox = document.getElementById('trouble-check');
                if (troubleCheckbox) {
                    troubleCheckbox.addEventListener('change', function () {
                        if (this.checked) {
                            showNotification(
                                '🤪 ตัวป่วนใช้พลัง\n\nจำไว้: วันนี้ต้องโหวตออก 2 คน!',
                                'warning'
                            );
                        }
                    });
                }
            }, 100);
        }
    });

    // Ghost - send letter if dead (OUTSIDE alivePlayers loop since Ghost is dead)
    const deadGhost = players.find(p => p.role === 'Ghost' && !p.isAlive);
    if (deadGhost) {
        const div = document.createElement('div');
        div.className = 'p-4 bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl border border-gray-500/30 mb-3 shadow-lg';
        div.innerHTML = `
            <label class="block text-gray-200 font-bold mb-2 text-sm"><i class="fas fa-ghost mr-2 text-gray-400"></i>พรายกระซิบ (ส่งข้อความ)</label>
            <div class="bg-black/40 p-3 rounded-lg border border-gray-500/30">
                <div class="text-xs text-gray-400 mb-2">ข้อความที่ส่งไปแล้ว: <span class="text-yellow-400 font-bold">${ghostLetters || '(ยังไม่มี)'}</span></div>
                <div class="flex gap-2">
                    <input type="text" id="ghost-letter" maxlength="1" placeholder="ตัวอักษร" class="w-16 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-center text-lg font-bold focus:border-yellow-500 focus:outline-none uppercase">
                    <button onclick="sendGhostLetter()" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                        <i class="fas fa-paper-plane mr-2"></i>ส่งตัวอักษร
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    }
}

function updateName(id, val) {
    const p = players.find(p => p.id === id);
    if (p) { p.name = val; saveGame(); }
}

// Ghost letter sending function
function sendGhostLetter() {
    const input = document.getElementById('ghost-letter');
    if (input && input.value) {
        const letter = input.value.toUpperCase().charAt(0);
        ghostLetters += letter;
        input.value = '';
        saveGame();
        showNotification(`👻 ส่งตัวอักษร "${letter}" สำเร็จ!\n\nข้อความทั้งหมด: ${ghostLetters}`, 'success');
        addLog(`Night ${nightCount}`, `Ghost ส่งตัวอักษร: ${letter}`);

        // Disable input until next night
        input.disabled = true;
        input.placeholder = '✓';
        const btn = input.nextElementSibling;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i>ส่งแล้ว';
            btn.className = 'flex-1 bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold cursor-not-allowed';
        }
    } else {
        showNotification('⚠️ กรุณาใส่ตัวอักษร 1 ตัว', 'warning');
    }
}

function processNight() {
    // NIGHT 1
    if (nightCount === 1) {
        players.forEach(p => {
            const sel = document.getElementById(`name-${p.id}`);
            if (sel && sel.value) p.name = sel.value;
            else if (!p.name) p.name = `${getRoleThai(p.role)} ${p.id.toString().slice(-3)}`;
        });
        addLog(`Night ${nightCount}`, "เริ่มต้นเกม / ระบุตัวตนผู้เล่นเรียบร้อย");
        document.getElementById('death-result').innerHTML = "<span class='text-gray-300'>เช้าวันแรก!</span><br>แนะนำตัวและเริ่มสนทนา";
        document.getElementById('alive-count').innerText = players.length;
        document.getElementById('night-screen').classList.add('hidden');
        document.getElementById('day-screen').classList.remove('hidden');
        currentPhase = 'day';
        playSound('day'); // Play day sound
        resetTimer();
        saveGame();
        return;
    }

    // NIGHT 2+
    const getValue = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const getCubKills = () => {
        const cub = players.find(p => p.role === 'WolfCub' && !p.isAlive);
        return cub ? 2 : 1;
    };

    const wolfTarget = getValue('wolf-target');
    const skTarget = getValue('sk-target');
    const witchKill = getValue('witch-kill');
    const witchSave = document.getElementById('witch-save')?.checked;
    const guardTarget = getValue('guard-target');
    const priestTarget = getValue('priest-target');
    const hunterShot = document.getElementById('hunter-shot')?.checked;
    const hunterTarget = getValue('hunter-target');
    const troubleMake = document.getElementById('trouble-check')?.checked;

    let deaths = [];
    let messages = [];
    let potentialDeaths = [];

    if (wolfTarget) potentialDeaths.push({ id: wolfTarget, attacker: 'Werewolf' });
    if (skTarget) potentialDeaths.push({ id: skTarget, attacker: 'SerialKiller' });
    if (witchKill) potentialDeaths.push({ id: witchKill, attacker: 'Witch' });

    potentialDeaths.forEach(attack => {
        if (attack.id === guardTarget && attack.attacker !== 'SerialKiller') { messages.push(`<span class='text-green-400'>🛡️ บอดี้การ์ดป้องกันสำเร็จ!</span>`); return; }
        if (attack.id === priestTarget) { messages.push(`<span class='text-gray-300'>✝️ นักบวชป้องกันสำเร็จ!</span>`); return; }
        if (witchSave && attack.attacker === 'Werewolf') { messages.push(`<span class='text-indigo-400'>🧪 แม่มดใช้ยาชุบชีวิต!</span>`); return; }
        deaths.push(attack.id);
    });

    deaths = [...new Set(deaths)];

    // Process deaths and check for special mechanics
    deaths.forEach(id => {
        const p = players.find(p => p.id == id);
        if (p && p.isAlive) {
            // Check if Cursed is attacked by werewolf
            const attackedByCursed = potentialDeaths.find(d => d.id == id && d.attacker === 'Werewolf');
            if (p.role === 'Cursed' && attackedByCursed) {
                // Cursed becomes werewolf instead of dying
                p.role = 'Werewolf';
                messages.push(`🧟 <span class="text-purple-500 font-bold">${p.name}</span> กลายเป็นหมาป่า!`);
                addLog(`Night ${nightCount}`, `${p.name} (Cursed) กลายเป็นหมาป่า`);
                return; // Don't kill them
            }

            // Check for Tough Guy
            const wolfAttack = potentialDeaths.find(d => d.id == id && d.attacker === 'Werewolf');
            if (p.role === 'ToughGuy' && wolfAttack && !toughGuyBitten) {
                toughGuyBitten = true;
                p.toughGuyBitten = true;
                messages.push(`💪 <span class="text-orange-500 font-bold">${p.name}</span> ถูกกัด แต่ยังไม่ตาย (จะตายคืนถัดไป)`);
                addLog(`Night ${nightCount}`, `${p.name} (Tough Guy) ถูกกัดแต่ยังไม่ตาย`);
                return; // Don't kill yet
            }

            p.isAlive = false;
            messages.push(`💀 <span class="text-red-500 font-bold text-lg">${p.name}</span> เสียชีวิต`);

            // Check if Hunter died - set pending shot
            if (p.role === 'Hunter') {
                hunterPendingShot = p.id;
                messages.push(`🔫 <span class="text-amber-500">นายพราน ${p.name} สามารถยิงคนหนึ่งได้</span>`);
            }

            // Check if Disease died by werewolf - wolves skip next night
            if (p.role === 'Disease' && wolfAttack) {
                window.wolfSkipNextNight = true;
                messages.push(`🤢 <span class="text-green-400">ผู้ป่วยติดเชื้อ! หมาป่าจะงดฆ่าคืนหน้า</span>`);
                addLog(`Night ${nightCount}`, `Disease ทำให้หมาป่างดฆ่าคืนถัดไป`);
            }
        }
    });

    // Check if Tough Guy from previous night should die now
    const toughGuy = players.find(p => p.toughGuyBitten && p.isAlive);
    if (toughGuy) {
        toughGuy.isAlive = false;
        toughGuy.toughGuyBitten = false;
        messages.push(`💀 <span class="text-red-500 font-bold text-lg">${toughGuy.name}</span> (Tough Guy) เสียชีวิตจากบาดแผลคืนก่อน`);
        addLog(`Night ${nightCount}`, `${toughGuy.name} (Tough Guy) ตายจากบาดแผล`);

        // If tough guy was hunter, they can shoot
        if (toughGuy.role === 'Hunter') {
            hunterPendingShot = toughGuy.id;
            messages.push(`🔫 <span class="text-amber-500">นายพราน ${toughGuy.name} สามารถยิงคนหนึ่งได้</span>`);
        }
    }

    // === PHASE 1: NEW ROLE LOGIC ===

    // 1. Disease mechanic - if Disease is killed by wolf, wolves skip next night
    const diseaseVictim = deaths.find(id => {
        const victim = players.find(p => p.id == id);
        const wolfAttack = potentialDeaths.find(d => d.id == id && d.attacker === 'Werewolf');
        return victim && victim.role === 'Disease' && wolfAttack;
    });
    if (diseaseVictim) {
        window.wolfSkipNextNight = true;
        messages.push(`🤢 <span class="text-green-500">Disease ป้องกันหมาป่า! พวกมันจะงดฆ่าคืนหน้า</span>`);
        addLog(`Night ${nightCount}`, "Disease ทำให้หมาป่างดฆ่าคืนถัดไป");
    }

    // 2. Apprentice Seer upgrade - if Seer died, ApprenticeSeer becomes Seer
    const seerDead = players.find(p => p.role === 'Seer' && !p.isAlive);
    const apprentice = players.find(p => p.role === 'ApprenticeSeer' && p.isAlive);
    if (seerDead && apprentice && !apprentice.upgradedToSeer) {
        apprentice.role = 'Seer';
        apprentice.upgradedToSeer = true;
        messages.push(`🎓 <span class="text-blue-400">${apprentice.name} (Apprentice Seer) รับช่วงต่อเป็น Seer!</span>`);
        addLog(`Night ${nightCount}`, `${apprentice.name} กลายเป็น Seer`);
    }

    // 3. Doppelganger transformation - if target died, transform
    const doppel = players.find(p => p.role === 'Doppelganger' && p.isAlive);
    if (doppel && doppel.doppelTarget && nightCount > 2) {
        const target = players.find(p => p.id == doppel.doppelTarget);
        if (target && !target.isAlive && !doppel.transformed) {
            const oldRole = doppel.role;
            doppel.role = target.role;
            doppel.transformed = true;
            messages.push(`🎭 <span class="text-purple-400">${doppel.name} (Doppelganger) กลายเป็น ${getRoleThai(target.role)}!</span>`);
            addLog(`Night ${nightCount}`, `${doppel.name} สวมรอยเป็น ${getRoleThai(target.role)}`);
        }
    }

    // 4. PI result notification - check if 3 players contain werewolf
    const piTarget = getValue('pi-target');
    if (piTarget && nightCount === 2) {
        const targetPlayer = players.find(p => p.id == piTarget);
        if (targetPlayer) {
            const targetIndex = players.findIndex(p => p.id == piTarget);
            const checkPlayers = [
                players[targetIndex - 1],
                targetPlayer,
                players[targetIndex + 1]
            ].filter(p => p); // Remove undefined

            const hasWolf = checkPlayers.some(p => ['Werewolf', 'LoneWolf', 'WolfCub'].includes(p.role));
            const resultMsg = hasWolf ?
                `🕵️ ผลสืบสวน: <span class="text-red-400">มีหมาป่าอยู่ในกลุ่ม 3 คนนี้!</span>` :
                `🕵️ ผลสืบสวน: <span class="text-green-400">ไม่มีหมาป่าในกลุ่ม 3 คนนี้</span>`;
            messages.push(resultMsg);
            addLog(`Night ${nightCount}`, `PI ตรวจสอบ ${checkPlayers.map(p => p.name).join(', ')}`);
        }
    }

    if (deaths.length === 0 && messages.length === 0) messages.push("🌙 คืนนี้เงียบสงบ ไม่มีใครเสียชีวิต");

    // === GHOST LETTERS DISPLAY ===
    const ghost = players.find(p => p.role === 'Ghost' && !p.isAlive);
    if (ghost && ghostLetters) {
        messages.push(`👻 <span class="text-gray-300">ข้อความจากพรายกระซิบ: <span class="text-yellow-400 font-bold text-lg tracking-widest">${ghostLetters}</span></span>`);
    }

    // === CUPID LOVERS MECHANIC ===
    // Check if any of the dead is a lover - kill the other
    if (cupidLovers.length === 2) {
        deaths.forEach(deadId => {
            if (cupidLovers.includes(String(deadId)) || cupidLovers.includes(Number(deadId))) {
                const loverIds = cupidLovers.map(id => Number(id) || String(id));
                const otherLoverId = loverIds.find(lid => String(lid) != String(deadId) && Number(lid) != Number(deadId));
                const otherLover = players.find(p => String(p.id) == String(otherLoverId) || Number(p.id) == Number(otherLoverId));
                if (otherLover && otherLover.isAlive) {
                    otherLover.isAlive = false;
                    messages.push(`💔 <span class="text-pink-400">${otherLover.name} ตายตามคู่รัก!</span>`);
                    addLog(`Night ${nightCount}`, `${otherLover.name} ตายตามคนรัก`);
                }
            }
        });
    }

    addLog(`Night ${nightCount}`, deaths.length > 0 ? `ผู้เสียชีวิต: ${deaths.map(d => players.find(p => p.id == d).name).join(', ')}` : "ไม่มีผู้เสียชีวิต");
    document.getElementById('death-result').innerHTML = messages.join('<br>');
    document.getElementById('alive-count').innerText = players.filter(p => p.isAlive).length;
    document.getElementById('night-screen').classList.add('hidden');
    document.getElementById('day-screen').classList.remove('hidden');
    currentPhase = 'day';

    // Play sounds based on events
    if (deaths.length > 0) {
        playSound('death'); // Play death sound
    } else {
        playSound('day'); // Play day sound
    }

    resetTimer();
    saveGame();
    checkWinCondition();
}

// --- DAY & VOTE ---
function startTimer() {
    if (timerInterval) return; // Guard against multiple intervals
    timerInterval = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
            const s = (timeRemaining % 60).toString().padStart(2, '0');
            document.getElementById('timer-display').innerText = `${m}:${s}`;
        } else {
            pauseTimer();
            // Play alert sound or notification when timer ends
            if (document.getElementById('timer-display')) {
                document.getElementById('timer-display').classList.add('text-red-500');
                setTimeout(() => {
                    document.getElementById('timer-display')?.classList.remove('text-red-500');
                }, 3000);
            }
        }
    }, 1000);
}
function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}
function resetTimer() {
    pauseTimer();
    timeRemaining = 180;
    const display = document.getElementById('timer-display');
    if (display) {
        display.innerText = "03:00";
        display.classList.remove('text-red-500');
    }
}
function showVoteModal() {
    const alive = players.filter(p => p.isAlive);
    const container = document.getElementById('vote-player-cards');
    document.getElementById('vote-alive-count').innerText = alive.length;

    // Clear previous selection
    window.selectedVoteTarget = '';

    // Create player cards
    container.innerHTML = alive.map(p => `
                <div onclick="selectVoteTarget('${p.id}')" id="vote-card-${p.id}"
                    class="vote-card cursor-pointer bg-gray-800/80 hover:bg-gray-700/80 border-2 border-gray-600 hover:border-red-500 rounded-xl p-4 transition-all transform hover:scale-105 group relative overflow-hidden">
                    
                    <!-- Gradient overlay on hover -->
                    <div class="absolute inset-0 bg-gradient-to-br from-red-500/0 to-red-500/0 group-hover:from-red-500/10 group-hover:to-red-500/5 transition-all pointer-events-none"></div>
                    
                    <!-- PHASE 2: Role Info Badges -->
                    ${p.role === 'Mayor' ? '<div class="absolute top-2 left-2 bg-yellow-600 text-white text-[0.6rem] px-2 py-0.5 rounded-full font-bold">2x โหวต</div>' : ''}
                    ${p.role === 'Pacifist' ? '<div class="absolute top-2 left-2 bg-blue-600 text-white text-[0.6rem] px-2 py-0.5 rounded-full font-bold">☮️ สันติ</div>' : ''}
                    ${p.role === 'Idiot' ? '<div class="absolute top-2 left-2 bg-purple-600 text-white text-[0.6rem] px-2 py-0.5 rounded-full font-bold">🤪 ทึ่ม</div>' : ''}
                    
                    <div class="relative z-10">
                        <!-- Avatar -->
                        <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex items-center justify-center text-2xl border-2 border-gray-600 group-hover:border-red-400 transition-all">
                            ${getPlayerEmoji(p.role)}
                        </div>
                        
                        <!-- Name -->
                        <div class="text-center font-bold text-white text-sm mb-1 truncate group-hover:text-red-300 transition-colors">${p.name}</div>
                        
                        <!-- Role (visible on hover) -->
                        <div class="text-center text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">${getRoleThai(p.role)}</div>
                        
                        <!-- Selected indicator -->
                        <div class="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 hidden items-center justify-center" id="check-${p.id}">
                            <i class="fas fa-check text-white text-xs"></i>
                        </div>
                    </div>
                </div>
            `).join('');

    // === PHASE 2: Display special role info alerts ===
    const mayor = alive.find(p => p.role === 'Mayor');
    const pacifist = alive.find(p => p.role === 'Pacifist');
    const idiot = alive.find(p => p.role === 'Idiot');

    let infoMessages = [];
    if (mayor) infoMessages.push(`🎖️ <strong>${mayor.name}</strong> เป็นนายก - เสียงโหวตนับ 2 เสียง`);
    if (pacifist) infoMessages.push(`☮️ <strong>${pacifist.name}</strong> ต้องโหวตให้รอด (Pacifist)`);
    if (idiot) infoMessages.push(`🤪 <strong>${idiot.name}</strong> ต้องโหวตให้ตาย (Idiot)`);

    if (infoMessages.length > 0) {
        setTimeout(() => {
            showNotification(
                '📋 ข้อมูลพิเศษ\n\n' + infoMessages.join('\n'),
                'info'
            );
        }, 300);
    }

    document.getElementById('vote-modal').classList.remove('hidden');
}

function selectVoteTarget(targetId) {
    window.selectedVoteTarget = targetId;

    // Update visual selection
    const alive = players.filter(p => p.isAlive);
    alive.forEach(p => {
        const card = document.getElementById(`vote-card-${p.id}`);
        const check = document.getElementById(`check-${p.id}`);

        if (card) {
            if (p.id == targetId && targetId !== '') {
                card.classList.add('border-red-500', 'bg-red-900/30');
                card.classList.remove('border-gray-600');
                if (check) check.classList.remove('hidden');
                if (check) check.classList.add('flex');
            } else {
                card.classList.remove('border-red-500', 'bg-red-900/30');
                card.classList.add('border-gray-600');
                if (check) check.classList.add('hidden');
                if (check) check.classList.remove('flex');
            }
        }
    });

    // Update no-vote button
    const noVoteBtn = document.getElementById('vote-no-one');
    if (noVoteBtn) {
        if (targetId === '') {
            noVoteBtn.classList.add('border-blue-500', 'bg-blue-900/30');
            noVoteBtn.classList.remove('border-gray-600');
        } else {
            noVoteBtn.classList.remove('border-blue-500', 'bg-blue-900/30');
            noVoteBtn.classList.add('border-gray-600');
        }
    }
}

function getPlayerEmoji(role) {
    const emojiMap = {
        'Villager': '👨‍🌾', 'Seer': '🔮', 'Bodyguard': '🛡️', 'Spellcaster': '🤐', 'Cupid': '💘',
        'AuraSeer': '✨', 'Drunk': '🍺', 'Prince': '👑', 'Priest': '✝️', 'PI': '🕵️',
        'Troublemaker': '🤪', 'Witch': '🧙‍♀️', 'OldHag': '👵', 'ApprenticeSeer': '🎓', 'Mayor': '🎖️',
        'Hunter': '🔫', 'Disease': '🤢', 'Pacifist': '☮️', 'Ghost': '👻', 'Mason': '👷',
        'Doppelganger': '🎭', 'Lycan': '🐺', 'ToughGuy': '💪', 'Idiot': '🤪',
        'Werewolf': '🐺', 'LoneWolf': '🌑', 'WolfCub': '🐾', 'Minion': '😈', 'Sorcerer': '🦹‍♀️',
        'Hoodlum': '👊', 'Cursed': '🧟', 'SerialKiller': '🔪', 'Fool': '🃏', 'Medium': '🕯️'
    };
    return emojiMap[role] || '❓';
}
function closeVoteModal() { document.getElementById('vote-modal').classList.add('hidden'); }

function showHunterShotModal() {
    const alive = players.filter(p => p.isAlive);
    document.getElementById('hunter-revenge-target').innerHTML = `<option value="">-- ไม่ยิงใคร --</option>` + alive.map(p => `<option value="${p.id}">${p.name}</option>`);
    document.getElementById('hunter-shot-modal').classList.remove('hidden');
}

function confirmHunterShot() {
    const targetId = document.getElementById('hunter-revenge-target').value;
    document.getElementById('hunter-shot-modal').classList.add('hidden');

    if (targetId) {
        const victim = players.find(p => p.id == targetId);
        if (victim) {
            victim.isAlive = false;
            const hunter = players.find(p => p.id == hunterPendingShot);
            addLog(currentPhase === 'night' ? `Night ${nightCount}` : `Day ${nightCount}`, `นายพราน ${hunter?.name || 'Unknown'} ยิง ${victim.name} ตาย`);
            alert(`🔫 นายพราน ยิง ${victim.name} ตาย!`);
        }
    }

    hunterPendingShot = null;
    saveGame();

    // Check win condition after hunter shot
    const isGameOver = checkWinCondition();
    if (!isGameOver && currentPhase === 'day') {
        // Continue to next night if in day phase
        nextNight();
    }
}
function confirmVote() {
    const id = window.selectedVoteTarget || '';
    const content = document.getElementById('vote-confirm-content');
    const icon = document.getElementById('vote-confirm-icon');

    if (id) {
        const p = players.find(p => p.id == id);

        // Show vote summary
        content.innerHTML = `
                    <div class="text-center">
                        <div class="text-6xl mb-4">${getPlayerEmoji(p.role)}</div>
                        <div class="text-2xl font-bold text-white mb-2">${p.name}</div>
                        <div class="inline-block bg-gray-700/50 px-3 py-1 rounded-lg text-sm text-gray-300 mb-4">
                            ${getRoleThai(p.role)}
                        </div>
                        <div class="text-red-400 font-bold text-lg mt-4">
                            <i class="fas fa-gavel mr-2"></i>จะถูกประหารชีวิต
                        </div>
                    </div>
                `;
        icon.className = 'fas fa-skull-crossbones text-4xl text-red-400';
    } else {
        // No one voted
        content.innerHTML = `
                    <div class="text-center py-6">
                        <div class="text-6xl mb-4">🕊️</div>
                        <div class="text-xl font-bold text-white mb-2">ไม่มีใครถูกโหวตออก</div>
                        <div class="text-gray-400 text-sm">
                            วันนี้ไม่มีการประหารชีวิต
                        </div>
                    </div>
                `;
        icon.className = 'fas fa-dove text-4xl text-blue-400';
    }

    // Close vote modal and show confirmation
    document.getElementById('vote-modal').classList.add('hidden');
    document.getElementById('vote-confirm-modal').classList.remove('hidden');
}

function cancelVoteConfirm() {
    // Close confirmation and reopen vote modal
    document.getElementById('vote-confirm-modal').classList.add('hidden');
    document.getElementById('vote-modal').classList.remove('hidden');
}

function proceedVote() {
    // Close confirmation modal
    document.getElementById('vote-confirm-modal').classList.add('hidden');

    const id = window.selectedVoteTarget || '';
    let voteMessage = '';

    if (id) {
        const p = players.find(p => p.id == id);

        // Check if Fool is voted - Fool wins!
        if (p.role === 'Fool') {
            p.isAlive = false;
            addLog(`Day ${nightCount}`, `${p.name} (Fool) ถูกโหวตออกและชนะ!`);
            saveGame();
            showGameOver(`${p.name} (Fool) ชนะเกม!`, 'ชนะเมื่อถูกโหวตประหาร', '🃏', 'border-pink-500/50', 'text-pink-300');
            return;
        }

        // Check if Prince and hasn't used power
        if (p.role === 'Prince' && !p.princeUsedPower) {
            p.princeUsedPower = true;
            voteMessage = `👑 ${p.name} เป็นเจ้าชาย! รอดจากการประหาร (เผยตัวตน)`;
            addLog(`Day ${nightCount}`, `${p.name} (Prince) รอดจากการโหวต`);
            showNotification(voteMessage, 'success');
            saveGame();
            return; // Prince survives
        }

        p.isAlive = false;
        voteMessage = `🔴 ${p.name} ถูกโหวตออกจากหมู่บ้าน`;
        addLog(`Day ${nightCount}`, voteMessage);

        // Check if voted person was Hunter - they can shoot back
        if (p.role === 'Hunter') {
            hunterPendingShot = p.id;
            showNotification(`🔫 นายพราน ${p.name} สามารถยิงคนหนึ่งก่อนตายได้!`, 'error');
            showHunterShotModal();
            return;
        }

        showNotification(voteMessage, 'error');

        // === CUPID LOVERS MECHANIC (Vote) ===
        // Check if voted person is a lover
        if (cupidLovers.length === 2) {
            const votedIdStr = String(p.id);
            if (cupidLovers.includes(votedIdStr) || cupidLovers.includes(p.id)) {
                const otherLoverId = cupidLovers.find(lid => String(lid) != votedIdStr);
                const otherLover = players.find(op => String(op.id) == String(otherLoverId));
                if (otherLover && otherLover.isAlive) {
                    otherLover.isAlive = false;
                    addLog(`Day ${nightCount}`, `${otherLover.name} ตายตามคนรัก`);
                    showNotification(`💔 ${otherLover.name} ตายตามคู่รัก!`, 'error');
                }
            }
        }
    }

    if (!id) {
        voteMessage = '⚪ วันนี้ไม่มีใครถูกโหวตออก';
        addLog(`Day ${nightCount}`, voteMessage);
        showNotification(voteMessage, 'info');
    }

    saveGame();
    const isGameOver = checkWinCondition();
    if (!isGameOver) nextNight();
}
function checkWinCondition() {
    const alive = players.filter(p => p.isAlive);

    // ถ้าทุกคนตายหมด = Draw
    if (alive.length === 0) {
        showGameOver('🤝 เสมอกัน', 'ทุกคนตายหมด', '⚰️', 'border-gray-500/50', 'text-gray-300');
        return true;
    }

    // Check Lone Wolf win (must be last person alive)
    const loneWolf = alive.find(p => p.role === 'LoneWolf');
    if (loneWolf && alive.length === 1) {
        showGameOver(`${loneWolf.name} (Lone Wolf) ชนะ!`, 'เป็นผู้รอดชีวิตคนเดียว', '🌑', 'border-purple-500/50', 'text-purple-300');
        return true;
    }

    const wolves = alive.filter(p => ['Werewolf', 'LoneWolf', 'WolfCub'].includes(p.role)).length;
    const minions = alive.filter(p => p.role === 'Minion').length;
    const sk = alive.filter(p => p.role === 'SerialKiller').length;
    const hoodlum = alive.find(p => p.role === 'Hoodlum');
    const villagers = alive.length - wolves - sk - minions;

    // Serial Killer wins (last person alive)
    if (sk === 1 && alive.length === 1) {
        const skPlayer = alive[0];
        showGameOver(`${skPlayer.name} (Serial Killer) ชนะ!`, 'ฆ่าทุกคนจนหมด', '🔪', 'border-red-500/50', 'text-red-300');
        return true;
    }

    // Hoodlum wins (2 targets are dead and hoodlum is alive)
    if (hoodlum && hoodlum.hoodlumTargets) {
        const target1Dead = !players.find(p => p.id == hoodlum.hoodlumTargets[0])?.isAlive;
        const target2Dead = !players.find(p => p.id == hoodlum.hoodlumTargets[1])?.isAlive;
        if (target1Dead && target2Dead) {
            showGameOver(`${hoodlum.name} (Hoodlum) ชนะ!`, 'เป้าหมายทั้งสองคนตายแล้ว', '👊', 'border-orange-500/50', 'text-orange-300');
            return true;
        }
    }

    // Villagers win (all werewolves, minions, and SK dead)
    if (wolves === 0 && minions === 0 && sk === 0) {
        showGameOver('ชาวบ้านชนะ!', 'กำจัดภัยร้ายทั้งหมดแล้ว', '🎉', 'border-green-500/50', 'text-green-300');
        return true;
    }

    // Werewolves win (werewolves + minions >= villagers, or only wolves left)
    if ((wolves + minions) >= villagers && villagers > 0 && wolves > 0) {
        showGameOver('หมาป่าชนะ!', 'ครอบงำหมู่บ้านแล้ว', '🐺', 'border-red-500/50', 'text-red-300');
        return true;
    }

    // Werewolves win (only werewolves and minions left)
    if ((wolves + minions) > 0 && villagers === 0 && sk === 0) {
        location.reload();
        return true;
    }
    return false; // Game continues
}

function showGameOver(title, subtitle, emoji, borderColor, titleColor) {
    const alive = players.filter(p => p.isAlive);
    const dead = players.filter(p => !p.isAlive);

    // Update header
    document.getElementById('game-over-emoji').innerText = emoji;
    document.getElementById('game-over-title').innerText = title;
    document.getElementById('game-over-title').className = `text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2 ${titleColor}`;
    document.getElementById('game-over-subtitle').innerText = subtitle;
    document.getElementById('game-over-container').className = `game-card w-full max-w-2xl rounded-2xl p-4 sm:p-6 md:p-8 border-2 my-auto ${borderColor}`;

    // Update stats
    document.getElementById('stat-nights').innerText = nightCount - 1;
    document.getElementById('stat-survivors').innerText = alive.length;
    document.getElementById('stat-deaths').innerText = dead.length;

    // Populate survivors grid with responsive classes
    const survivorsGrid = document.getElementById('survivors-grid');
    if (alive.length > 0) {
        survivorsGrid.innerHTML = alive.map(p => `
                    <div class="bg-gray-800/60 rounded-xl p-2 sm:p-3 text-center border border-gray-600/50 hover:border-green-500/50 transition-all">
                        <div class="text-2xl sm:text-3xl mb-1 sm:mb-2">${getPlayerEmoji(p.role)}</div>
                        <div class="text-xs sm:text-sm font-bold text-white truncate">${p.name}</div>
                        <div class="text-[0.65rem] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">${getRoleThai(p.role)}</div>
                    </div>
                `).join('');
    } else {
        survivorsGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 sm:py-8 text-sm sm:text-base">ไม่มีผู้รอดชีวิต</div>';
    }

    // Show modal
    document.getElementById('game-over-modal').classList.remove('hidden');
}

function restartGame() {
    showConfirm('ต้องการเริ่มเกมใหม่หรือไม่?', () => {
        try { localStorage.removeItem('ww_mod_save'); } catch (e) { }
        location.reload();
    });
}

function clearSaveData() {
    showConfirm('ต้องการลบข้อมูลที่บันทึกและเริ่มเกมใหม่หรือไม่?', () => {
        try { localStorage.removeItem('ww_mod_save'); } catch (e) { }
        location.reload();
    });
}

function viewGameLog() {
    // Don't close game-over-modal, just show log on top
    showGameLog();
}

let confirmCallback = null;

function showConfirm(message, onYes) {
    document.getElementById('confirm-message').innerText = message;
    confirmCallback = onYes;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function confirmYes() {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
    }
}

function confirmNo() {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
}

function showNotification(message, type = 'info') {
    const modal = document.getElementById('notification-modal');
    const icon = document.getElementById('notif-icon');
    const iconContainer = document.getElementById('notif-icon-container');
    const messageEl = document.getElementById('notif-message');

    // Update message
    messageEl.innerText = message;

    // Update icon and colors based on type
    if (type === 'error') {
        icon.className = 'fas fa-times-circle text-4xl text-red-400';
        iconContainer.className = 'w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4';
        modal.querySelector('.game-card').className = 'game-card w-full max-w-md rounded-2xl p-6 border border-red-500/30';
        modal.querySelector('button').className = 'w-full bg-red-600 hover:bg-red-500 py-3 rounded-xl text-white font-bold transition-colors btn-game';
    } else if (type === 'success') {
        icon.className = 'fas fa-check-circle text-4xl text-green-400';
        iconContainer.className = 'w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4';
        modal.querySelector('.game-card').className = 'game-card w-full max-w-md rounded-2xl p-6 border border-green-500/30';
        modal.querySelector('button').className = 'w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl text-white font-bold transition-colors btn-game';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle text-4xl text-yellow-400';
        iconContainer.className = 'w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4';
        modal.querySelector('.game-card').className = 'game-card w-full max-w-md rounded-2xl p-6 border border-yellow-500/30';
        modal.querySelector('button').className = 'w-full bg-yellow-600 hover:bg-yellow-500 py-3 rounded-xl text-white font-bold transition-colors btn-game';
    } else { // info
        icon.className = 'fas fa-info-circle text-4xl text-blue-400';
        iconContainer.className = 'w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4';
        modal.querySelector('.game-card').className = 'game-card w-full max-w-md rounded-2xl p-6 border border-blue-500/30';
        modal.querySelector('button').className = 'w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl text-white font-bold transition-colors btn-game';
    }

    // Show modal
    modal.classList.remove('hidden');
}

function closeNotification() {
    document.getElementById('notification-modal').classList.add('hidden');
}

function nextNight() { nightCount++; document.getElementById('day-screen').classList.add('hidden'); document.getElementById('night-screen').classList.remove('hidden'); currentPhase = 'night'; renderNightActions(); saveGame(); }

// --- MODALS ---
function showRoleGuide() { document.getElementById('role-guide-modal').classList.remove('hidden'); }
function closeRoleGuide() { document.getElementById('role-guide-modal').classList.add('hidden'); }
function showStatusModal() {
    document.getElementById('modal-player-list').innerHTML = players.map(p => `
                <div class="flex justify-between items-center p-3 bg-gray-900/50 mb-2 rounded-lg border border-gray-700/50 ${!p.isAlive ? 'opacity-50 grayscale' : ''}">
                    <div>
                        <span class="font-bold text-gray-200">${p.name}</span>
                        <div class="text-xs text-gray-400">${getRoleThai(p.role)}</div>
                    </div>
                    <span class="${p.isAlive ? 'text-green-400 bg-green-900/20 px-2 py-1 rounded text-xs' : 'text-red-500 font-bold'}">${p.isAlive ? 'รอด' : 'ตาย'}</span>
                </div>
            `).join('');
    document.getElementById('status-modal').classList.remove('hidden');
}
function closeStatusModal() { document.getElementById('status-modal').classList.add('hidden'); }
function showGameLog() {
    const list = document.getElementById('game-log-list');
    if (gameLog.length === 0) list.innerHTML = '<p class="text-center text-gray-500 py-4">ยังไม่มีบันทึก</p>';
    else list.innerHTML = gameLog.map(l => `
                <div class="border-b border-gray-700 pb-2 mb-2">
                    <div class="flex justify-between text-xs text-gray-500 mb-1">
                        <span class="font-bold text-yellow-600">${l.phase}</span>
                        <span>${l.time}</span>
                    </div>
                    <div class="text-gray-300 text-sm">${l.event}</div>
                </div>
            `).join('');
    document.getElementById('log-modal').classList.remove('hidden');
}
function closeGameLog() { document.getElementById('log-modal').classList.add('hidden'); }

// Vote Modal Logic
let voteTimerInterval;

function showVoteModal() {
    // Reset Views
    document.getElementById('vote-countdown-section').classList.remove('hidden');
    document.getElementById('vote-selection-section').classList.add('hidden');

    // Reset Timer UI
    document.getElementById('vote-modal').classList.remove('hidden');
    document.getElementById('vote-countdown').innerText = '3';
    document.getElementById('start-vote-btn').disabled = false;
    document.getElementById('start-vote-btn').classList.remove('opacity-50', 'cursor-not-allowed');
    document.getElementById('start-vote-btn').innerHTML = '<i class="fas fa-play mr-2"></i>เริ่มนับถอยหลัง';
}

function closeVoteModal() {
    document.getElementById('vote-modal').classList.add('hidden');
    clearInterval(voteTimerInterval);
}

function startVoteCountdown() {
    const btn = document.getElementById('start-vote-btn');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>กำลังนับ...';

    // Play vote sound immediately when countdown starts
    playSound('vote');

    let count = 3;
    const display = document.getElementById('vote-countdown');
    display.innerText = count;
    display.classList.add('scale-125');

    voteTimerInterval = setInterval(() => {
        count--;
        if (count > 0) {
            display.innerText = count;
            display.classList.remove('scale-125');
            void display.offsetWidth; // trigger reflow
            display.classList.add('scale-125');
        } else {
            clearInterval(voteTimerInterval);
            display.innerText = "ชี้!";
            if (navigator.vibrate) navigator.vibrate(500);

            // Switch to Selection Phase after 2 seconds
            setTimeout(() => {
                document.getElementById('vote-countdown-section').classList.add('hidden');
                document.getElementById('vote-selection-section').classList.remove('hidden');
                renderVotePlayers();
            }, 2000);
        }
    }, 1000);
}

function renderVotePlayers() {
    const container = document.getElementById('vote-player-grid');
    const alive = players.filter(p => p.isAlive);

    container.innerHTML = alive.map(p => `
        <div onclick="confirmVote(${p.id})" 
            class="bg-gray-800 hover:bg-red-900/40 border border-gray-600 hover:border-red-500 rounded-xl p-3 cursor-pointer transition-all flex flex-col items-center">
            <div class="text-3xl mb-1">${getPlayerEmoji(p.role)}</div>
            <div class="font-bold text-white text-sm text-center truncate w-full">${p.name}</div>
            <div class="text-[0.6rem] text-gray-400">${getRoleThai(p.role)}</div>
        </div>
    `).join('');
}

function confirmVote(targetId) {
    if (targetId) {
        const p = players.find(p => p.id === targetId);
        if (p) {
            // Check for Pacifist (cannot die by vote)
            if (p.role === 'Pacifist') {
                showNotification(`🕊️ ${p.name} เป็นผู้รักสันติ (Pacifist)\nไม่สามารถถูกโหวตออกได้!`, 'warning');
                addLog('Vote', `${p.name} (Pacifist) รอดจากการโหวต`);
                closeVoteModal();
                return;
            }

            p.isAlive = false;

            addLog('Vote', `${p.name} ถูกโหวตออกจากหมู่บ้าน`);
            showNotification(`💀 ${p.name} ถูกโหวตออกแล้ว`, 'success');

            // Play death sound
            playSound('death');
        }
    } else {
        addLog('Vote', `ไม่มีใครถูกโหวตออก`);
        showNotification(`💨 ไม่มีใครถูกโหวตออกในวันนี้`, 'info');
    }


    // Auto transition to night after 3 seconds
    setTimeout(() => {
        nextNight();
    }, 3000);

    saveGame();
    closeVoteModal();
}


// Moderator Script Modal
function showModScript() { document.getElementById('mod-script-modal').classList.remove('hidden'); }
function closeModScript() { document.getElementById('mod-script-modal').classList.add('hidden'); }
