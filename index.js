import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// ============================================================================
// 🛠️ 全局配置与状态
// ============================================================================
const SETTING_KEY = "singularity_biomass_storage";
const DRAWER_ID = "merged_singularity_obsession";
const CONTENT_ID = "merged_plugin_content";
const defaultSettings = { biomass: {} };

// Singularity 播放器状态
let globalPlaylist = [];
let currentTrackIndex = -1;
let isRandomMode = false;
let audioPlayer = new Audio();
let isPlaying = false;
audioPlayer.onended = () => playNextTrack();

// 加载 JSZip (用于导出)
if (typeof window.JSZip === 'undefined') {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
}

// ============================================================================
// 跨域 Blob 抓取器
// ============================================================================
async function fetchBlobFromParent(url) {
    try {
        const fetcher = (window.top && window.top.fetch) ? window.top.fetch : window.fetch;
        const response = await fetcher(url);

        if (!response.ok) throw new Error(`Status ${response.status}`);
        return await response.blob();
    } catch (e) {
        console.error("Blob capture failed:", e);
        return null;
    }
}

// 转义函数
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================================
// 🎨 样式注入
// ============================================================================
const cssStyle = `
    :root { 
        --hux-accent: var(--smart-theme-quote-color, #90caf9); 
        --hux-bg-card: var(--bg-2, #1e1e1e); 
        --hux-border: var(--border-color, #333); 
    }
    
    /* --- 容器与主入口 --- */
    .merged-content-wrapper { 
        padding: 15px; 
        display: flex; 
        flex-direction: column; 
        gap: 15px; 
        align-items: center; 
    }
    
    /* --- Singularity 列表样式 --- */
    .hux-controls { 
        padding: 10px; display: flex; align-items: center; gap: 8px; 
        background: var(--bg-1, #1e1e1e);
    }
    .hux-btn { 
        cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; 
        border-radius: 4px; background: rgba(255,255,255,0.1); 
        border: 1px solid var(--hux-border, #333); color: var(--text-body, #e0e0e0); transition: 0.1s; 
    }
    .hux-btn:hover { background: var(--hux-accent, #90caf9); color: var(--bg-0, #121212); border-color: var(--hux-accent); }
    .hux-list { padding: 8px; background: var(--bg-0, #121212); }
    
    .hux-item { 
        background: var(--hux-bg-card, #1e1e1e); border: 1px solid var(--hux-border, #333); 
        margin-bottom: 6px; border-radius: 4px; padding: 5px; 
    }
    .hux-item.playing { border-left: 4px solid var(--hux-accent); background: var(--bg-3, #2a2a2a); }
    
    .hux-header { padding: 8px 10px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9em; }
    .hux-preview { flex-grow: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 500; }
    .hux-body { display: none; padding: 10px; border-top: 1px dashed var(--hux-border); font-size: 0.9em; opacity: 0.9; }
    .hux-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 5px; }
    
    .hux-assimilate-btn {
        cursor: pointer; opacity: 0.6; margin-left: 8px; display: inline-block; 
        transition: all 0.2s ease; font-size: 2em; vertical-align: middle; color: var(--SmartThemeBodyColor, #ccc);
    }
    .hux-assimilate-btn:hover { opacity: 1; transform: scale(1.2); color: var(--hux-accent); }
    
    .obs-big-btn { 
        width: 100%; max-width: 300px; padding: 15px; 
        background: linear-gradient(135deg, #2c0b0e, #5a1a1a); 
        color: #ff6b6b; border: 1px solid #ff6b6b; border-radius: 8px;
        font-size: 1.1em; font-weight: bold; cursor: pointer; transition: transform 0.2s;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;
        /* 防止遮挡 */
        position: relative; z-index: 9999; 
        user-select: none; -webkit-tap-highlight-color: transparent;
    }
    .obs-big-btn:hover { transform: scale(1.02); filter: brightness(1.2); }

    /* --- 🔥 全屏 Modal --- */
    .obsession-modal {
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100vw;
        height: 100vh;      
        height: 100dvh;     
        background: var(--bg-0, #121212) !important;
        z-index: 2147483647; 
        display: flex; 
        flex-direction: column;
        
        color: var(--text-body, #e0e0e0); 
        font-family: var(--font-body, sans-serif);
        animation: fadeIn 0.2s ease-out;
        overscroll-behavior: contain;
    }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .obsession-header { 
        background: var(--bg-1, #1e1e1e) !important; 
        padding: 15px; 
        border-bottom: 1px solid #5a1a1a; 
        display: flex; 
        align-items: center; 
        justify-content: space-between;
        flex-shrink: 0; 
        min-height: 60px; 
    }
    
    .obsession-body { 
        flex: 1; 
        padding: 20px; 
        overflow-y: scroll; 
        -webkit-overflow-scrolling: touch;
        background: var(--bg-0, #121212);
        padding-bottom: 100px;
    }
    
    .stat-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .word-tag { background: #333; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; display:inline-block; margin:2px; }
    .search-result-item { background: var(--bg-1); border-left: 3px solid #555; padding: 15px; margin-bottom: 15px; border-radius: 0 6px 6px 0; }
    .search-result-item.is-ai { border-left-color: #ff6b6b; background: rgba(255, 107, 107, 0.05); }
    .highlight-text { color: #ffeb3b; font-weight: bold; background: rgba(255, 235, 59, 0.1); }
    .singularity-collect-btn { cursor: pointer; margin-left: 10px; opacity: 0.5; font-size: 1.2em; }

    @media (max-width: 768px) {
        .obsession-modal {
        background: var(--bg-0, transparent) !important; 
            bottom: 0 !important; right: 0 !important;
        }
        
        .obsession-header {
            flex-wrap: wrap; 
            padding: 10px;
            gap: 10px;
        }
        
        .obsession-body {
            overflow-y: auto !important; 
            height: auto !important;
            -webkit-overflow-scrolling: touch !important;
        }
        
        .hux-btn, .obs-big-btn, #close-obsession, #close-singularity {
            min-height: 44px; 
            min-width: 44px;
        }
    }
`;

if ($('#merged-plugin-style').length === 0) {
    $('head').append(`<style id="merged-plugin-style">${cssStyle}</style>`);
}

// ============================================================================
// 🧠 数据管理
// ============================================================================
function loadSettings() {
    if (!extension_settings[SETTING_KEY]) extension_settings[SETTING_KEY] = defaultSettings;
    return extension_settings[SETTING_KEY];
}

function saveSettings(data) {
    extension_settings[SETTING_KEY] = data;
    saveSettingsDebounced();
}

function getUniqueCharKey() {
    const context = getContext();
    if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return context.name2;
}
// ============================================================================
// 🚑 数据迁移与上传
// ============================================================================

// 1. 通用上传函数 (使用 jQuery ajax 自动处理 CSRF token)
async function uploadToSillyTavern(blob, filename) {
    const reader = new FileReader();
    const base64Data = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });

    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/api/files/upload',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ name: filename, data: base64Data }),

            success: function (result) {
                console.log("[Singularity] Upload Success:", result);

                let rawPath = result.path || `user/files/${filename}`;
                let webPath = rawPath.replace(/\\/g, "/");

                resolve(webPath);
            },

            error: function (xhr, status, err) {
                console.error("[Singularity] Upload Failed:", xhr.responseText);
                reject(new Error(`Upload failed: ${xhr.status} ${err}`));
            }
        });
    });
}

// 2. 核心迁移逻辑：将 Blob 数据转存为服务器文件
async function migrateLegacyData() {
    if (!confirm("⚠️ 准备好迁移数据了吗？\n\n这会将所有旧的音频数据上传为独立文件。\n过程可能需要几秒钟，请勿关闭页面。")) return;

    const settings = loadSettings();
    let migratedCount = 0;

    toastr.info("正在迁移数据...", "Singularity");

    for (const charKey in settings.biomass) {
        const list = settings.biomass[charKey];
        if (!Array.isArray(list)) continue;

        for (let i = 0; i < list.length; i++) {
            const item = list[i];

            if (item.data && !item.path) {
                if (typeof item.data === 'string' && item.data.startsWith("blob:")) {
                    try {
                        const blob = await fetchBlobFromParent(item.data);

                        if (!blob) {
                            console.warn("Blob expired, skipping:", item.data);
                            continue;
                        }

                        let ext = "wav";
                        if (blob.type.includes("mp3")) ext = "mp3";

                        const safeDate = Date.now() + i;
                        const filename = `Singularity_Legacy_${safeDate}.${ext}`;

                        const newPath = await uploadToSillyTavern(blob, filename);

                        if (newPath) {
                            item.path = newPath;
                            delete item.data;
                            migratedCount++;
                        }
                    } catch (e) {
                        console.error("Migration skipped for item:", item, e);
                    }
                }
            }
        }
    }

    if (migratedCount > 0) {
        saveSettings(settings);
        if ($('#singularity-modal').length > 0) {
            const searchVal = $('#singularity-search').val();
            renderSingularityList(searchVal);
        }
        toastr.success(`成功迁移 ${migratedCount} 条音频！`, "完成");
    } else {
        toastr.info("没有发现需要迁移的数据，或者旧数据已失效（刷新页面会导致 Blob 链接失效）。", "Singularity");
    }
}

// ============================================================================
// 🖥️ 主界面渲染
// ============================================================================
function refreshInterface() {
    let $drawer = $(`#${DRAWER_ID}`);

    if ($drawer.length === 0) {
        $drawer = $(`<div id="${DRAWER_ID}" class="inline-drawer"></div>`);
        $("#extensions_settings").append($drawer);

        const html = `
            <div class="inline-drawer-header inline-drawer-toggle" style="cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;">
                <b>👁️‍🗨️ The Singularity</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-right"></div>
            </div>
            
            <div id="${CONTENT_ID}" class="merged-content-wrapper" style="display:none; width:100%; flex-direction:column; gap:10px;">
                
                <div class="obs-big-btn" 
                     onclick="window.openSingularityGlobal(event)" 
                     style="background: linear-gradient(135deg, #1c1c1c, #3a3a3a); color: var(--hux-accent); border-color: var(--hux-accent); position: relative; z-index: 1000; cursor: pointer;">
                    
                    <div style="font-size: 1.5em; margin-bottom: 5px; pointer-events: none;">
                        <i class="fa-solid fa-brain"></i>
                    </div>
                    <div style="pointer-events: none;">
                        记忆回廊<br><span style="font-size:0.7em; opacity:0.7">Singularity Storage</span>
                    </div>
                </div>

                <div class="obs-big-btn" 
                     onclick="window.openObsessionGlobal(event)"
                     style="position: relative; z-index: 1000; cursor: pointer;">
                     
                    <div style="font-size: 1.5em; margin-bottom: 5px; pointer-events: none;">
                        <i class="fa-solid fa-spider"></i>
                    </div>
                    <div style="pointer-events: none;">
                        执念数据<br><span style="font-size:0.7em; opacity:0.7">Obsession Analytics</span>
                    </div>
                </div>

            </div>
        `;
        $drawer.html(html);

        $drawer.find(".inline-drawer-toggle").off('click touchstart').on("click touchstart", function (e) {
            if (e.type === 'touchstart') $(this).data('ts', Date.now());
            if (e.type === 'click' && $(this).data('ts') && Date.now() - $(this).data('ts') < 500) return;

            e.preventDefault();
            const $wrapper = $(`#${CONTENT_ID}`);
            const $icon = $(this).find(".inline-drawer-icon");

            if ($wrapper.is(":visible")) {
                $wrapper.slideUp(200, () => $icon.removeClass("fa-circle-chevron-down").addClass("fa-circle-chevron-right"));
            } else {
                $wrapper.css("display", "flex").hide().slideDown(200, function () {
                    $(this).css("display", "flex");
                    $icon.removeClass("fa-circle-chevron-right").addClass("fa-circle-chevron-down");
                });
            }
        });
    }
}

// ============================================================================
// 🧠 Singularity 全屏模态框
// ============================================================================
function showSingularityModal() {
    if ($('#singularity-modal').length > 0) return;

    const uniqueKey = getUniqueCharKey();
    const context = getContext();
    const charName = context.name2 || "Target";

    const modalHtml = `
    <div class="obsession-modal" id="singularity-modal">
        <div class="obsession-header">
            <div style="font-size:1.2em; font-weight:bold; color:var(--hux-accent); white-space:nowrap; margin-right:15px;">
                🧠 Singularity: ${charName}
            </div>
            
            <div style="flex-grow:1; max-width:500px; margin:0 10px;">
                <input type="text" id="singularity-search" placeholder="Search memories..." 
                       style="width:100%; padding:8px 15px; border-radius:20px; border:1px solid #555; background:rgba(0,0,0,0.3); color:white;">
            </div>

            <div class="hux-controls" style="background: transparent; border: none; padding:0; gap:6px; margin: 0 10px; flex-shrink: 0;">
                <div class="hux-btn" id="hux-play-btn"><i class="fa-solid fa-play"></i></div>
                <div class="hux-btn" id="hux-next-btn"><i class="fa-solid fa-forward-step"></i></div>
                
                <div class="hux-btn" id="hux-migrate-btn" title="迁移旧数据" style="color:#ffca28; border-color:#ffca28;">
                    <i class="fa-solid fa-recycle"></i>
                </div>

                <div class="hux-btn" id="hux-export" title="导出备份"><i class="fa-solid fa-file-zipper"></i></div>
            </div>
            
            <div class="hux-btn" id="close-singularity" style="width:auto; padding:0 15px; border-color:transparent;">EXIT</div>
        </div>
        <div class="obsession-body" id="singularity-list-area" style="padding: 10px 20px;"></div>
    </div>`;

    $('body').append(modalHtml);

    $('#singularity-modal').css({ 'background-color': '#121212', 'background': '#121212' });
    renderSingularityList();

    $('#close-singularity').on('click', () => $('#singularity-modal').remove());

    const $modal = $('#singularity-modal');
    $modal.find("#hux-play-btn").on("click", togglePlay);
    $modal.find("#hux-next-btn").on("click", playNextTrack);
    $modal.find("#hux-export").on("click", () => exportAsZip(uniqueKey, loadSettings().biomass[uniqueKey] || []));

    $modal.find("#hux-migrate-btn").on("click", migrateLegacyData);

    $modal.find('#singularity-search').on('input', function () {
        renderSingularityList($(this).val());
    });

    if (isPlaying) updatePlayerUI();
}


function renderSingularityList(filterText = "") {
    const $container = $("#singularity-list-area");
    if ($container.length === 0) return;

    const settings = loadSettings();
    const uniqueKey = getUniqueCharKey();
    const fallbackName = getContext().name2;

    let list = [];
    if (settings.biomass && settings.biomass[uniqueKey]) list = settings.biomass[uniqueKey];
    else if (fallbackName && settings.biomass && settings.biomass[fallbackName]) list = settings.biomass[fallbackName];

    let fullList = list.filter(item => item && typeof item === 'object');

    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        fullList = fullList.filter(item => {
            const t = (item.title || "").toLowerCase();
            const c = (item.text || "").replace(/<[^>]*>/g, "").toLowerCase();
            return t.includes(lowerFilter) || c.includes(lowerFilter);
        });
    }

    globalPlaylist = fullList.filter(item => (item.data && !item.data.startsWith('blob:')) || item.path);

    let listHtml = '';
    if (filterText) {
        listHtml += `<div style="text-align:center; padding:5px; font-size:0.85em; opacity:0.6; margin-bottom:10px; color:var(--hux-accent);">
            检索序列完成：共定位到 <span style="font-weight:bold; color:white;">${fullList.length}</span> 条记忆碎片
        </div>`;
    }
    if (fullList.length === 0) {
        listHtml = `<div style="padding:50px; text-align:center; opacity:0.5; font-size:1.2em;">
            <i class="fa-solid fa-filter" style="font-size:3em; margin-bottom:20px;"></i><br>
            ${filterText ? "未找到匹配的记忆碎片" : "暂无记忆样本。<br>请在聊天记录中点击 👁️‍🗨️ 进行采集。"}
        </div>`;
    } else {
        [...fullList].reverse().forEach(item => {
            const hasAudio = !!(item.data || item.path);
            const plainText = item.text.replace(/<[^>]*>/g, "").slice(0, 60);

            let displayTitle = item.title ? `【${item.title}】` : '';
            let displayText = plainText;

            listHtml += `
            <div class="hux-item ${hasAudio ? 'has-audio' : ''}" data-id="${item.id}" style="max-width: 900px; margin: 0 auto 10px auto;">
                <div class="hux-header">
                    <span style="opacity:0.5; font-size:0.8em; min-width:80px;">${item.date.split(' ')[0] || "Date"}</span>
                    <span class="hux-preview">
                        ${displayTitle ? `<span style="color:var(--hux-accent)">${displayTitle}</span>` : ''} ${displayText}
                    </span>
                    <span>${hasAudio ? '<i class="fa-solid fa-music"></i>' : '<i class="fa-solid fa-align-left"></i>'}</span>
                </div>
                <div class="hux-body">
                    <div style="white-space: pre-wrap; margin-bottom:10px;">${escapeHtml(item.text)}</div>
                    <div class="hux-actions">
                        ${hasAudio ? `<div class="hux-btn play-one" data-id="${item.id}" title="播放"><i class="fa-solid fa-play"></i></div>` : ''}
                        <div class="hux-btn edit-item" data-id="${item.id}" title="编辑标题"><i class="fa-solid fa-pen"></i></div>
                        <div class="hux-btn del-item" data-id="${item.id}" title="删除"><i class="fa-solid fa-trash"></i></div>
                    </div>
                </div>
            </div>`;
        });
    }

    $container.html(listHtml);

    $container.find(".hux-header").on("click", function () { $(this).next(".hux-body").slideToggle(150); });
    $container.find(".play-one").on("click", function (e) {
        e.stopPropagation();
        const index = globalPlaylist.findIndex(x => x.id === $(this).data("id"));
        if (index !== -1) playTrackByIndex(index);
    });
    $container.find(".del-item").on("click", function (e) {
        e.stopPropagation();
        if (confirm("移除此记忆？")) {
            settings.biomass[uniqueKey] = settings.biomass[uniqueKey].filter(x => x.id !== $(this).data("id"));
            saveSettings(settings);
            renderSingularityList($("#singularity-search").val());
        }
    });
    $container.find(".edit-item").on("click", function (e) {
        e.stopPropagation();
        const item = settings.biomass[uniqueKey].find(x => x.id === $(this).data("id"));
        if (item) {
            const t = prompt("标题:", item.title);
            if (t !== null) {
                item.title = t;
                saveSettings(settings);
                renderSingularityList($("#singularity-search").val());
            }
        }
    });

    if (isPlaying && currentTrackIndex !== -1 && globalPlaylist[currentTrackIndex]) {
        $(`.hux-item[data-id="${globalPlaylist[currentTrackIndex].id}"]`).addClass("playing");
    }
}
// ============================================================================
// 🕷️ Obsession 全屏模态框
// ============================================================================
function showObsessionModal() {
    $('#obsession-modal').remove();
    const context = getContext();
    const charName = context.name2 || "Target";

    const modalHtml = `
    <div class="obsession-modal" id="obsession-modal">
        <div class="obsession-header">
            <div style="font-size:1.2em; font-weight:bold; color:#ff6b6b;">🕷️ The Obsession: ${charName}</div>
            <div style="flex-grow:1; max-width:500px; margin:0 20px;">
                <input type="text" id="obs-search" placeholder="搜索记忆碎片..." style="width:100%; padding:8px 15px; border-radius:20px; border:1px solid #555; background:rgba(0,0,0,0.3); color:white;">
            </div>
            <div class="hux-btn" id="close-obsession" style="width:auto; padding:0 15px;">EXIT</div>
        </div>
        <div class="obsession-body" id="obs-body-content"></div>
    </div>`;

    $('body').append(modalHtml);

    $('#obsession-modal').css({
        'background-color': '#121212',
        'background': '#121212'
    });

    renderObsessionStats(context);
    $('#close-obsession').on('click', () => $('#obsession-modal').remove());

    let timeout;
    $('#obs-search').on('input', function () {
        const val = $(this).val();
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (!val.trim()) renderObsessionStats(context);
            else renderObsessionSearch(val, context);
        }, 300);
    });
}

// ============================================================================
// 📊 统计生成核心算法
// ============================================================================
function calculateStats(chatData) {
    let stats = {
        totalMsgs: chatData.chat.length,
        userWords: 0, aiWords: 0,
        wordMap: {},
        hours: new Array(24).fill(0),
        dates: {},
        startDate: "Unknown"
    };

    const stopWords = new Set([
        "the", "and", "a", "to", "of", "it", "in", "is", "you", "i", "me", "my", "that", "he", "she", "his", "her", "him", "with", "for", "on", "as", "at", "but", "be", "not", "what", "so", "have", "do", "this", "from", "by", "or",
        "just", "about", "very", "would", "could", "should", "really", "something", "anything", "nothing",
        "back", "down", "over", "there", "here", "then", "now", "when", "where", "why", "how", "out", "up", "all", "some", "any", "no", "yes", "oh", "well", "like", "one", "can", "want", "know", "think", "get", "go", "see",
        "are", "your", "will", "was", "has", "did", "does", "don",
        "look", "make", "tell", "need", "let",
        "because", "they", "them", "who", "only", "more", "too", "right", "time", "were",
        "mode", "sandbox",
        "我", "你", "他", "她", "它", "的", "了", "在", "是", "就", "都", "而", "及", "与", "着", "个", "这", "那", "有", "也", "很", "啊", "吧", "呢", "吗", "么", "去", "来", "说", "着",
        "user", "char", "name"
    ]);

    if (chatData.charName) stopWords.add(chatData.charName.toLowerCase());
    if (chatData.userName) stopWords.add(chatData.userName.toLowerCase());

    chatData.chat.forEach(msg => {
        let rawText = (msg.mes || "");

        try {
            let dStr = msg.send_date || msg.date;

            if (dStr && typeof dStr === "string") {
                let cleanDStr = dStr.replace(/[年月]/g, '/').replace(/[日]/g, '');
                cleanDStr = cleanDStr.replace(/(\d)(am|pm)/gi, '$1 $2');
                let dateObj = new Date(cleanDStr);

                if (!isNaN(dateObj.getTime())) {
                    if (stats.startDate === "Unknown" || dateObj < new Date(stats.startDate)) {
                        stats.startDate = dateObj.toLocaleDateString();
                    }

                    let h = dateObj.getHours();
                    if (h >= 0 && h < 24) stats.hours[h]++;

                    let y = dateObj.getFullYear();
                    let m = dateObj.getMonth() + 1;
                    let d = dateObj.getDate();
                    let dateKey = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                    stats.dates[dateKey] = (stats.dates[dateKey] || 0) + 1;
                }
            }
        } catch (e) {
            console.error("Date parse error:", e);
        }

        let cleanBaseText = rawText.replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "");
        if (msg.is_user) stats.userWords += cleanBaseText.length;
        else stats.aiWords += cleanBaseText.length;

        const quoteRegex = /["“]([^"”]*?)["”]/g;
        let match;
        let dialogueContent = "";
        while ((match = quoteRegex.exec(cleanBaseText)) !== null) { dialogueContent += match[1] + " "; }

        if (dialogueContent.trim()) {
            dialogueContent.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g)?.forEach(t => {
                if (!stopWords.has(t)) stats.wordMap[t] = (stats.wordMap[t] || 0) + 1;
            });
        }
    });

    const minFrequency = stats.totalMsgs > 300 ? 3 : 2;
    stats.topWords = Object.entries(stats.wordMap)
        .filter(([_, c]) => c >= minFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);

    return stats;
}

// ============================================================================
// 📈 SVG 图表生成器 
// ============================================================================
function generateSVGChart(data, type = "bar", color = "#ff6b6b", height = 60) {
    if (!data || data.length === 0) return "";

    const maxVal = Math.max(...data) || 1;
    const width = 100; // viewbox units
    const step = width / (data.length - 1 || 1);

    let svgContent = "";

    if (type === "bar") {
        const barWidth = (width / data.length) * 0.8;
        data.forEach((val, i) => {
            const h = (val / maxVal) * height;
            const x = (width / data.length) * i;
            const y = height - h;
            const opacity = 0.3 + (val / maxVal) * 0.7;
            svgContent += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="1" style="opacity:${opacity}"/>`;
        });
    } else if (type === "line") {
        let points = "";
        let areaPoints = `0,${height} `;

        data.forEach((val, i) => {
            const h = (val / maxVal) * height;
            const x = i * step;
            const y = height - h;
            points += `${x},${y} `;
            areaPoints += `${x},${y} `;
        });

        areaPoints += `${width},${height}`;

        svgContent += `<polygon points="${areaPoints}" fill="${color}" style="opacity:0.15"/>`;
        svgContent += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        const maxIdx = data.indexOf(maxVal);
        const maxX = maxIdx * step;
        const maxY = height - ((maxVal / maxVal) * height);
        svgContent += `<circle cx="${maxX}" cy="${maxY}" r="2" fill="#fff" stroke="${color}" stroke-width="1"/>`;
    }

    return `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" style="width:100%; height:${height}px; overflow:visible;">${svgContent}</svg>`;
}


// ============================================================================
// 🕷️ 渲染 Obsession 统计面板
// ============================================================================
function renderObsessionStats(context) {
    const stats = calculateStats({
        chat: context.chat || [],
        charName: context.name2,
        userName: context.name1
    });

    let cloudHtml = stats.topWords.map(([w, c]) =>
        `<span class="word-tag" title="出现 ${c} 次">${w} <small style="opacity:1; color:#ffffff; font-weight:bold; margin-left:2px;">${c}</small></span>`
    ).join("");

    if (!cloudHtml) cloudHtml = `<div style="opacity:0.5; padding:20px; text-align:center;">暂无足够数据生成词云</div>`;

    const totalWords = (stats.userWords + stats.aiWords) || 1;
    const aiPercent = (stats.aiWords / totalWords) * 100;
    const userPercent = 100 - aiPercent;
    const userDisplay = context.name1 || "User";
    const charDisplay = context.name2 || "Char";
    const hoursData = stats.hours;

    const sortedDates = Object.keys(stats.dates).sort();
    const recentDates = sortedDates.slice(-30);
    const trendData = recentDates.map(d => stats.dates[d]);

    let startLabel = "- / -";
    let endLabel = "- / -";
    if (recentDates.length > 0) {
        startLabel = recentDates[0].split('-').slice(1).join('-');
        endLabel = recentDates[recentDates.length - 1].split('-').slice(1).join('-');
    }

    const chart24h = generateSVGChart(hoursData, "bar", "#90caf9", 50);
    const chartTrend = generateSVGChart(trendData, "line", "#ff6b6b", 50);

    const html = `
        <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:15px;">
            <div class="stat-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0;">📊 双方输出统计</h3>
                    <span style="font-size:0.8em; opacity:0.6;">First Contact: ${stats.startDate}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:1.1em; margin-bottom:8px; font-weight:bold;">
                    <span style="color:#90caf9">${userDisplay}: <span style="font-family:monospace">${stats.userWords}</span> 字</span>
                    <span style="color:#ff6b6b">${charDisplay}: <span style="font-family:monospace">${stats.aiWords}</span> 字</span>
                </div>
                <div style="background:rgba(255,255,255,0.1); height:14px; border-radius:7px; overflow:hidden; display:flex;">
                    <div style="height:100%; width:${userPercent}%; background:#90caf9;" title="${userDisplay}: ${userPercent.toFixed(1)}%"></div>
                    <div style="height:100%; width:${aiPercent}%; background:#ff6b6b;" title="${charDisplay}: ${aiPercent.toFixed(1)}%"></div>
                </div>
            </div>

            <div class="stat-card" style="position:relative;">
                <h3 style="margin:0 0 15px 0;">⏳ 时间突触</h3>
                <div style="margin-bottom:20px;">
                    <div style="font-size:0.85em; opacity:0.7; margin-bottom:5px; display:flex; justify-content:space-between;">
                        <span>24小时活跃分布</span>
                        <span>峰值: <b style="color:#90caf9">${hoursData.indexOf(Math.max(...hoursData))}点</b></span>
                    </div>
                    ${chart24h}
                </div>

                <div>
                    <div style="font-size:0.85em; opacity:0.7; margin-bottom:5px;">近30天聊天强度 (截止至 ${endLabel})</div>
                    ${chartTrend}
                    <div style="display:flex; justify-content:space-between; font-size:0.7em; opacity:0.4; margin-top:2px;">
                        <span>${startLabel}</span>
                        <span style="opacity:0.5">Recent Trend</span>
                        <span>${endLabel}</span>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <h3 style="margin-bottom:5px;">🔑 高频用词</h3>
                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">${cloudHtml}</div>
            </div>
        </div>`;

    $('#obs-body-content').html(html);
}

function renderObsessionSearch(query, context) {
    const matches = context.chat.filter(msg => (msg.mes || "").toLowerCase().includes(query.toLowerCase()));
    let html = `<div style="max-width:800px; margin:0 auto;">
        <div style="text-align:center; padding-bottom:15px; margin-bottom:15px; border-bottom:1px dashed #333; font-size:0.9em; opacity:0.7;">
            <span style="color:#ff6b6b">⚡</span> 
            关键词 "<span style="color:#fff;">${escapeHtml(query)}</span>" 
            共匹配到 <b style="color:#ff6b6b; font-size:1.1em;">${matches.length}</b> 条
        </div>`;
    matches.slice().reverse().forEach((msg, idx) => {
        const rawText = msg.mes.replace(/<[^>]+>/g, "");
        const regex = new RegExp(`(${query})`, "gi");
        const highlight = rawText.replace(regex, '<span class="highlight-text">$1</span>');
        html += `
        <div class="search-result-item ${msg.is_user ? '' : 'is-ai'}">
            <div style="display:flex; justify-content:space-between; opacity:0.6; font-size:0.8em; margin-bottom:5px;">
                <span>${msg.send_date || "Unknown Date"}</span>
                ${!msg.is_user ? `<span class="singularity-collect-btn" data-text="${encodeURIComponent(rawText)}" title="收藏">🧬 收藏</span>` : ''}
            </div>
            <div style="white-space:pre-wrap;">${highlight}</div>
        </div>`;
    });
    html += `</div>`;
    $('#obs-body-content').html(html);

    $('#obs-body-content').find('.singularity-collect-btn').on('click', function () {
        const text = decodeURIComponent($(this).data('text'));
        storeGeneSequence(context.name2, text, null, "Obsession Collect");
        $(this).text("✔️ 已归档").css("color", "#b19cd9");
    });
}

// ============================================================================
// 🎼 核心逻辑
// ============================================================================
// 强制使用顶层窗口抓取 Blob 
async function assimilateAudio(url) {
    if (!url) return null;

    if (!url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:")) {
        const baseUrl = window.location.origin;
        let cleanPath = url.startsWith("/") ? url.slice(1) : url;
        url = `${baseUrl}/${cleanPath}`;
    }

    try {
        console.log("[Singularity] Attempting to fetch audio:", url);

        const fetcher = (window.top && window.top.fetch) ? window.top.fetch : window.fetch;

        const response = await fetcher(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        return await response.blob();
    } catch (err) {
        console.warn("[Singularity] Audio capture failed:", err);
        toastr.error("无法抓取音频流，可能是跨域限制。", "Singularity Error");
        return null;
    }
}

function playTrackByIndex(index) {
    if (index < 0 || index >= globalPlaylist.length) return;
    currentTrackIndex = index;
    const item = globalPlaylist[index];
    let src = null;

    if (item.path) {
        let safePath = item.path.replace(/\\/g, "/");
        if (!safePath.startsWith("http") && !safePath.startsWith("/")) {
            safePath = "/" + safePath;
        }
        src = safePath;
    }
    else if (item.data) {
        src = item.data;
    }

    if (src) {
        console.log("[Singularity] Playing URL:", src);
        if (audioPlayer.src && audioPlayer.src.startsWith("blob:") && audioPlayer.src !== src) {
            console.log("清理旧的音频内存:", audioPlayer.src);
            URL.revokeObjectURL(audioPlayer.src);
        }
        audioPlayer.src = src;
        audioPlayer.play().catch(e => console.error(e));
        isPlaying = true;
        updatePlayerUI();
        $(".hux-item").removeClass("playing");
        $(`.hux-item[data-id="${item.id}"]`).addClass("playing");
    }
}

function playNextTrack() {
    if (globalPlaylist.length === 0) return;
    currentTrackIndex = isRandomMode ? Math.floor(Math.random() * globalPlaylist.length) : currentTrackIndex + 1;
    if (currentTrackIndex >= globalPlaylist.length) currentTrackIndex = 0;
    playTrackByIndex(currentTrackIndex);
}

function togglePlay() {
    if (globalPlaylist.length === 0) return;
    if (audioPlayer.paused && audioPlayer.src) { audioPlayer.play(); isPlaying = true; }
    else if (!audioPlayer.paused) { audioPlayer.pause(); isPlaying = false; }
    else playNextTrack();
    updatePlayerUI();
}

function updatePlayerUI() {
    const icon = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    $("#hux-play-btn").html(icon);
    $('#singularity-modal #hux-play-btn').html(icon);
    const item = globalPlaylist[currentTrackIndex];
    if (item) {
        $("#hux-status").text(`🎵 ${item.title || "Unknown Track"}`);
        $('#singularity-modal #hux-status').text(`🎵 ${item.title || "Unknown Track"}`);
    }
}

// ============================================================================
// 文件上传接口 
// ============================================================================

async function storeGeneSequence(charName, textContent, audioBlob, date) {
    const settings = loadSettings();
    const uniqueKey = getUniqueCharKey();
    if (!settings.biomass[uniqueKey]) settings.biomass[uniqueKey] = [];

    if (settings.biomass[uniqueKey].some(x => x.text === textContent)) {
        toastr.warning("记忆已存在", "Singularity");
        return false;
    }

    let savedFilePath = null;

    if (audioBlob) {
        try {
            if (typeof audioBlob === 'object' && audioBlob instanceof Blob) {
                toastr.info("正在归档音频样本...", "Singularity");

                let ext = "wav";
                if (audioBlob.type.includes("mp3")) ext = "mp3";
                const safeChar = charName.replace(/[^a-zA-Z0-9_\-]/g, "_");
                const filename = `Singularity_${safeChar}_${Date.now()}.${ext}`;

                savedFilePath = await uploadToSillyTavern(audioBlob, filename);
                toastr.success("音频实体已固化。", "Singularity");
            }
            else if (typeof audioBlob === 'string') {
                savedFilePath = audioBlob;
            }
        } catch (e) {
            console.error("上传失败:", e);
            toastr.error("音频归档失败，仅保存文本。", "Error");
        }
    }

    settings.biomass[uniqueKey].push({
        id: Date.now(),
        date: date || new Date().toLocaleString(),
        title: "",
        text: textContent,
        path: savedFilePath || null,
        data: null
    });

    saveSettings(settings);
    refreshInterface();
    if ($('#singularity-modal').is(':visible')) renderSingularityList();
    return true;
}

function exportAsZip(charName, list) {
    if (typeof JSZip === 'undefined') { toastr.error("ZIP库未加载"); return; }
    const zip = new JSZip();
    let log = "";
    list.forEach((item) => { log += `[${item.date}] ${item.text.replace(/<[^>]+>/g, "")}\n---\n`; });
    zip.file("memory_log.txt", log);
    zip.generateAsync({ type: "blob" }).then(content => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${charName}_memories.zip`;
        a.click();
    });
}

// ============================================================================
// 👁️‍🗨️ 按钮注入与采集逻辑
// ============================================================================

// 1. 扫描并注入按钮
function injectButton($mes) {
    if (!$mes || $mes.length === 0) return;
    if ($mes.find(".hux-assimilate-btn").length > 0) return;

    let $targetArea = $mes.find(".mes_buttons");
    if ($targetArea.length === 0) $targetArea = $mes.find(".timestamp");

    const $btn = $(`<div class="hux-assimilate-btn" title="采集至 Singularity" style="display:inline-block;cursor:pointer;margin:0 8px;opacity:0.3;font-size:1.1em;transition:0.2s;">👁️‍🗨️</div>`);

    $btn.hover(
        function () { $(this).css({ opacity: 0.9, transform: "scale(1.2)" }) },
        function () { $(this).css({ opacity: 0.3, transform: "scale(1)" }) }
    );

    if ($targetArea.length > 0) $targetArea.append($btn);
    else $mes.find(".mes_text").after($btn);
}

// 2. 全量扫描函数 (管理者：页面加载或切换角色时用)
// 这个函数现在只是简单的循环调用 injectButton
function scanForOrganics() {
    $(".mes").each(function () {
        injectButton($(this));
    });
}

$(document).on("click", ".hux-assimilate-btn", async function (e) {
    e.preventDefault();
    e.stopPropagation();

    const $icon = $(this);
    const $mes = $icon.closest(".mes");

    $icon.text("⏳").css({ opacity: 1 });

    const context = getContext();
    const charName = $mes.attr("ch_name") || context.name2 || "Unknown";
    let rawString = $mes.find(".mes_text").text();
    let noStyleString = rawString.replace(/<style[\s\S]*?<\/style>/gi, "");
    let cleanText = noStyleString
        .replace(/```html/g, "") 
        .replace(/```/g, "")    
        .replace(/<[^>]+>/g, "\n") 
        .replace(/&nbsp;/g, " ");  
    const fullText = cleanText
        .split('\n')          
        .map(line => line.trim()) 
        .filter(line => line)    
        .join('\n');          

    let msgDate = $mes.find(".timestamp").text().trim();
    if (!msgDate) msgDate = $mes.attr("timestamp") || new Date().toLocaleString();

    // ---------------------------------------------------------
    // 搜捕音频源
    // ---------------------------------------------------------
    let audioUrl = null;

    const $internalAudio = $mes.find("audio");
    if ($internalAudio.length > 0 && $internalAudio.attr("src")) {
        audioUrl = $internalAudio.attr("src");
        console.log("[Singularity] Found internal audio:", audioUrl);
    }

    if (!audioUrl) {
        try {
            const topDoc = window.top.document;
            const globalAudio = topDoc.getElementById("tts_audio");

            if (globalAudio && globalAudio.src) {
                console.log("[Singularity] Found global TTS audio:", globalAudio.src);
                audioUrl = globalAudio.src;
            }
        } catch (err) {
            console.warn("[Singularity] Cannot access parent DOM for audio search:", err);
        }
    }


    // ---------------------------------------------------------
    // 数据提取与转换
    // ---------------------------------------------------------
    let audioBlob = null;

    if (audioUrl) {
        if (typeof fetchBlobFromParent === 'function') {
            audioBlob = await fetchBlobFromParent(audioUrl);
        } else {
            try {
                const res = await fetch(audioUrl);
                audioBlob = await res.blob();
            } catch (e) {
                console.error("Fetch failed in fallback", e);
            }
        }
    } else {
        console.warn("[Singularity] No audio source found for this message.");
    }

    // ---------------------------------------------------------
    // 存储序列
    // ---------------------------------------------------------
    const success = await storeGeneSequence(charName, fullText, audioBlob, msgDate);

    if (success) {
        if (audioBlob) {
            $icon.text("🧬").css("color", "#b19cd9");
            toastr.success("音频实体已捕获。", "Singularity");
        } else {
            $icon.text("📝").css("color", "#a8d8ea");
            toastr.warning("未检测到音频流，仅保存文本。", "Singularity");
        }

        refreshInterface();

        setTimeout(() => {
            $icon.text("👁️‍🗨️").css("color", "").css("opacity", 0.3);
        }, 3000);
    } else {
        $icon.text("⚠️");
        setTimeout(() => $icon.text("👁️‍🗨️"), 2000);
    }
});

// ============================================================================
// 启动与监听
// ============================================================================
jQuery(() => {
    console.log("Singularity + Obsession Merge [Optimized] Loaded.");
    refreshInterface();

    setTimeout(scanForOrganics, 1000);
    setTimeout(scanForOrganics, 3000);

    const chatObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const $node = $(node);
                    if ($node.hasClass('mes')) {
                        injectButton($node);
                    }
                    else {
                        $node.find('.mes').each((_, el) => injectButton($(el)));
                    }
                }
            });
        });
    });

    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        chatObserver.observe(chatContainer, { childList: true, subtree: true });
    } else {
        setTimeout(() => {
            const retryChat = document.querySelector('#chat');
            if (retryChat) chatObserver.observe(retryChat, { childList: true, subtree: true });
        }, 2000);
    }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        refreshInterface();
        setTimeout(scanForOrganics, 500);
    });
});


// ============================================================================
// 全局挂载 
// ============================================================================
window.openSingularityGlobal = function (e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    console.log("Global Singularity Triggered");
    showSingularityModal();
};

window.openObsessionGlobal = function (e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    console.log("Global Obsession Triggered");
    showObsessionModal();
};
