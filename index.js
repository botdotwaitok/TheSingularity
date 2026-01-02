import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

const SETTING_KEY = "singularity_biomass_storage";
const DRAWER_ID = "singularity_biopod_interface";
const GLOBAL_AUDIO_ID = "tts_audio"; 

const defaultSettings = {
    biomass: {} 
};

// --- 数据管理 ---

function loadBiomass() {
    if (!extension_settings[SETTING_KEY]) {
        extension_settings[SETTING_KEY] = defaultSettings;
    }
    return extension_settings[SETTING_KEY];
}

function saveBiomass(data) {
    extension_settings[SETTING_KEY] = data;
    saveSettingsDebounced();
}

// --- 核心采集功能 ---
async function assimilateAudio(url) {
    if (!url) return null;
    if (url.startsWith("data:")) {
        console.log("[Singularity] Detected raw Data URI. Storing directly.");
        return url;
    }

    console.log("[Singularity] Attempting to assimilate audio from URL:", url);
    if (!url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:")) {
        const baseUrl = window.location.origin + window.location.pathname;
        const cleanPath = url.startsWith("/") ? url.slice(1) : url;
        const cleanBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        url = cleanBase + cleanPath;
        console.log("[Singularity] Resolved relative path to:", url);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
        
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn("[Singularity] Base64 conversion failed. Storing raw path.", err);
        return url; 
    }
}

// 储存逻辑
function storeGeneSequence(charName, textContent, base64Data, originalDate) {
    const settings = loadBiomass();
    if (!settings.biomass[charName]) {
        settings.biomass[charName] = [];
    }
    
    // 查重
    const list = settings.biomass[charName];
    if (list.length > 0) {
        const last = list[list.length - 1];
        if (last.text === textContent && last.data === base64Data) return false;
    }

    settings.biomass[charName].push({
        id: Date.now(),
        date: originalDate || new Date().toLocaleString(),
        text: textContent, 
        data: base64Data   
    });

    saveBiomass(settings);
    return true;
}

// --- 扫描注入 (UI显示) ---

function scanForOrganics() {
    $(".mes").each(function() {
        const $mes = $(this);
        if ($mes.find(".hux-assimilate-btn").length > 0) return;

        let $targetArea = $mes.find(".mes_buttons"); 
        if ($targetArea.length === 0) $targetArea = $mes.find(".timestamp");

        const $btn = $(`<div class="hux-assimilate-btn" title="点击同化 (若无音频，请先播放该消息)" style="
            display: inline-block; 
            cursor: pointer; 
            margin: 0 8px;
            opacity: 0.3; 
            font-size: 1.1em;
            transition: all 0.2s;
            filter: grayscale(100%);
        ">👁️‍🗨️</div>`);
        
        $btn.hover(
            function() { $(this).css({opacity: 1, transform: "scale(1.2)", filter: "grayscale(0%)"}); },
            function() { $(this).css({opacity: 0.3, transform: "scale(1.0)", filter: "grayscale(100%)"}); }
        );

        if ($targetArea.length > 0) {
            $targetArea.append($btn);
        } else {
            $mes.find(".mes_text").after($btn);
        }
    });
}

// --- 采集事件监听 ---
$(document).on("click", ".hux-assimilate-btn", async function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $icon = $(this);
    const $mes = $icon.closest(".mes");
    $icon.text("⏳").css({opacity: 1, filter: "none"});
    const charName = $mes.attr("ch_name") || getContext().name2;
    const fullText = $mes.find(".mes_text").html(); 
    let msgDate = $mes.find(".timestamp").text().trim();
    if (!msgDate) msgDate = $mes.attr("timestamp");
    let $audio = $mes.find("audio");
    let audioSrc = $audio.attr("src");
    if (!audioSrc) {
        const globalAudio = document.getElementById(GLOBAL_AUDIO_ID);
        if (globalAudio && globalAudio.src && globalAudio.src !== window.location.href) {
            console.log("[Singularity] Capturing from Global Player:", globalAudio.src.slice(0, 50) + "...");
            audioSrc = globalAudio.src;
        }
    }
    
    let base64Data = null;
    if (audioSrc) {
        if (audioSrc !== "undefined" && audioSrc !== "") {
            toastr.info("正在同化音频信号...", "Singularity");
            base64Data = await assimilateAudio(audioSrc);
        }
    }

    const success = storeGeneSequence(charName, fullText, base64Data, msgDate);

    if (success) {
        const iconSign = base64Data ? "🧬" : "📝";
        const iconColor = base64Data ? "#ffdedeff" : "#d0ecffff";
        
        $icon.text(iconSign).css("color", iconColor).attr("title", base64Data ? "完整样本 (含音频)" : "文本样本");
        
        let successMsg = `样本已采集: ${msgDate || "未知时间"}`;
        if(base64Data) successMsg += " [音频已捕获]";
        else successMsg += " [仅文本]";

        toastr.success(successMsg, "Singularity");
        refreshInterface(); 
        
        setTimeout(() => {
            $icon.text("👁️‍🗨️").css("color", "").css("opacity", 0.3).css("filter", "grayscale(100%)");
        }, 3000);
    } else {
        $icon.text("⚠️").attr("title", "样本已存在");
        setTimeout(() => $icon.text("👁️‍🗨️"), 2000);
    }
});


// --- 侧边栏 UI ---

function refreshInterface() {
    const context = getContext();
    const currentChar = context.name2;
    const settings = loadBiomass();
    const fullList = settings.biomass[currentChar] || [];
    
    let $drawer = $(`#${DRAWER_ID}`);

    const cssStyle = `
        .hux-container {
            font-family: var(--font-body); 
            background: var(--block-body); 
            color: var(--text-body);      
            border: 1px solid var(--border-color); 
            margin-top: 5px;
            display: flex;
            flex-direction: column;
            overflow: hidden; 
        }
        
        .hux-content-wrapper {
            display: block; 
        }

        .hux-search-box {
            padding: 10px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(0, 0, 0, 0.1);
        }
        
        .hux-search-input {
            width: 100%;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            background: var(--input-bg);  
            color: var(--input-text);      
        }
        .hux-search-input:focus {
            border-color: var(--link-color); 
        }

        .hux-list {
            max-height: 400px; 
            overflow-y: auto;
            padding: 5px;
        }

        .hux-item {
            background: var(--bg-1);
            border: 1px solid var(--border-color);
            border-left: 3px solid var(--smart-theme-quote-color, #d0ecffff);
            margin-bottom: 8px;
            border-radius: 5px;
            overflow: hidden;
            transition: all 0.2s;
        }
        .hux-item.has-audio {
            border-left-color: #ffdedeff;
        }
        
        .hux-header {
            padding: 8px 10px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.85em;
            background: rgba(255,255,255,0.02);
        }
        .hux-header:hover {
            background: rgba(255,255,255,0.05);
        }
        
        .hux-date { opacity: 0.7; font-size: 0.8em; }
        .hux-preview { 
            margin-left: 10px; 
            flex-grow: 1;
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            opacity: 0.8;
            margin-right: 10px;
        }
        
        .hux-body {
            display: none;
            padding: 10px;
            border-top: 1px dashed var(--border-color);
            font-size: 0.9em;
            word-wrap: break-word;
            background: rgba(0,0,0,0.1);
        }
        
        .hux-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 5px;
            border-top: 1px solid rgba(255,255,255,0.05);
            padding-top: 5px;
        }
        .hux-del {
            color: var(--smart-theme-red, #ff4d4d);
            cursor: pointer;
            font-size: 0.8em;
        }
        .hux-del:hover { text-decoration: underline; }
    `;

    if ($("#hux-style").length === 0) $("head").append(`<style id="hux-style">${cssStyle}</style>`);
    if ($drawer.length === 0) {
        $drawer = $(`<div id="${DRAWER_ID}" class="inline-drawer"></div>`);
        $("#extensions_settings").append($drawer);
    }

    const renderSkeleton = () => {
        let listHtml = '';

        if (fullList.length === 0) {
            listHtml = `<div style="padding:20px; text-align:center; opacity:0.5;">[ NO BIOMASS DATA ]</div>`;
        } else {
            [...fullList].reverse().forEach(item => {
                const plainText = item.text.replace(/<[^>]*>/g, "").slice(0, 30);
                const hasAudio = !!item.data;
                const searchText = (item.text + " " + item.date).replace(/<[^>]*>/g, "").toLowerCase();

                listHtml += `
                <div class="hux-item ${hasAudio ? 'has-audio' : ''}" data-id="${item.id}" data-search="${searchText.replace(/"/g, '&quot;')}">
                    <div class="hux-header">
                        <span class="hux-date">${item.date.split(' ')[0]}</span>
                        <span class="hux-preview">${plainText}</span>
                        <span>${hasAudio ? '🔊' : '📄'}</span>
                    </div>
                    <div class="hux-body">
                        <div class="hux-text">${item.text}</div>
                        ${hasAudio ? `<audio controls src="${item.data}" style="width: 100%; margin-top:5px; height: 30px;"></audio>` : ''}
                        <div class="hux-actions">
                            <span class="hux-del" data-id="${item.id}">[DELETE SEQUENCE]</span>
                        </div>
                    </div>
                </div>`;
            });
        }

        const html = `
            <div class="hux-container">
                <div class="inline-drawer-header inline-drawer-toggle">
                    <b>👁️‍🗨️ ${currentChar} :: 奇点收藏</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                
                <div class="hux-content-wrapper">
                    <div class="hux-search-box">
                        <input type="text" class="hux-search-input" placeholder="Search memories..." id="hux-search-bar">
                    </div>
                    <div class="hux-list">
                        ${listHtml}
                    </div>
                </div>
            </div>
        `;
        
        $drawer.html(html);

        $drawer.find(".inline-drawer-toggle").on("click", function() {
            const $wrapper = $drawer.find(".hux-content-wrapper");
            const $icon = $(this).find(".inline-drawer-icon");
            
            $wrapper.slideToggle(200, function() {
                if ($wrapper.is(":visible")) {
                    $icon.removeClass("fa-circle-chevron-right").addClass("fa-circle-chevron-down");
                } else {
                    $icon.removeClass("fa-circle-chevron-down").addClass("fa-circle-chevron-right");
                }
            });
        });

        $drawer.find("#hux-search-bar").on("input", function() {
            const val = $(this).val().toLowerCase();
            $drawer.find(".hux-item").each(function() {
                const $item = $(this);
                const searchContent = $item.data("search");
                if (searchContent.includes(val)) {
                    $item.show();
                } else {
                    $item.hide();
                }
            });
        });

        $drawer.find(".hux-header").on("click", function() {
            const $body = $(this).next(".hux-body");
            $body.slideToggle(150);
        });

        $drawer.find(".hux-del").on("click", function(e) {
            e.stopPropagation();
            const id = $(this).data("id");
            if (confirm("Permanently purge this memory sequence?")) {
                settings.biomass[currentChar] = settings.biomass[currentChar].filter(x => x.id !== id);
                saveBiomass(settings);
                refreshInterface(); 
            }
        });
    };

    renderSkeleton();
}


// --- 启动 ---
jQuery(async () => {
    const engage = () => {
        setTimeout(scanForOrganics, 500);
        setTimeout(scanForOrganics, 1500); 
        refreshInterface();
    };

    eventSource.on(event_types.MESSAGE_RECEIVED, engage);
    eventSource.on(event_types.CHAT_CHANGED, engage);
    eventSource.on(event_types.CHARACTER_LOADED, engage);
    if (event_types.MESSAGE_RENDERED) eventSource.on(event_types.MESSAGE_RENDERED, () => setTimeout(scanForOrganics, 100));

    engage();
    setInterval(scanForOrganics, 2000); 
});