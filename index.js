import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

const SETTING_KEY = "singularity_biomass_storage";
const DRAWER_ID = "singularity_biopod_interface";
const GLOBAL_AUDIO_ID = "tts_audio"; 
const defaultSettings = { biomass: {} };

if (typeof window.JSZip === 'undefined') {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")
        .done(() => console.log("[Singularity] JSZip module loaded."))
        .fail(() => console.error("[Singularity] Failed to load JSZip."));
}

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

async function assimilateAudio(url) {
    if (!url) return null;
    if (url.startsWith("data:")) return url;

    if (!url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:")) {
        const baseUrl = window.location.origin + window.location.pathname;
        const cleanPath = url.startsWith("/") ? url.slice(1) : url;
        const cleanBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        url = cleanBase + cleanPath;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn("[Singularity] Audio capture failed:", err);
        return null;
    }
}

function storeGeneSequence(charName, textContent, base64Data, originalDate) {
    const settings = loadBiomass();
    if (!settings.biomass[charName]) settings.biomass[charName] = [];
    
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

function scanForOrganics() {
    $(".mes").each(function() {
        const $mes = $(this);
        if ($mes.find(".hux-assimilate-btn").length > 0) return;

        let $targetArea = $mes.find(".mes_buttons"); 
        if ($targetArea.length === 0) $targetArea = $mes.find(".timestamp");

        const $btn = $(`<div class="hux-assimilate-btn" title="点击同化音频" style="
            display: inline-block; cursor: pointer; margin: 0 8px; opacity: 0.3; 
            font-size: 1.1em; transition: all 0.2s; filter: grayscale(100%);
        ">👁️‍🗨️</div>`);
        
        $btn.hover(
            function() { $(this).css({opacity: 0.8, transform: "scale(1.1)", filter: "grayscale(0%)"}); },
            function() { $(this).css({opacity: 0.3, transform: "scale(1.0)", filter: "grayscale(100%)"}); }
        );

        if ($targetArea.length > 0) $targetArea.append($btn);
        else $mes.find(".mes_text").after($btn);
    });
}

$(document).on("click", ".hux-assimilate-btn", async function(e) {
    e.preventDefault(); e.stopPropagation();
    const $icon = $(this);
    const $mes = $icon.closest(".mes");
    
    $icon.text("⏳").css({opacity: 1});
    
    const charName = $mes.attr("ch_name") || getContext().name2;
    const fullText = $mes.find(".mes_text").html(); 
    let msgDate = $mes.find(".timestamp").text().trim();
    if (!msgDate) msgDate = $mes.attr("timestamp");

    let $audio = $mes.find("audio");
    let audioSrc = $audio.attr("src");
    if (!audioSrc) {
        const globalAudio = document.getElementById(GLOBAL_AUDIO_ID);
        if (globalAudio && globalAudio.src && globalAudio.src !== window.location.href) {
            audioSrc = globalAudio.src;
        }
    }
    
    let base64Data = null;
    if (audioSrc && audioSrc !== "undefined") {
        toastr.info("正在提取音频...", "Singularity");
        base64Data = await assimilateAudio(audioSrc);
    }

    const success = storeGeneSequence(charName, fullText, base64Data, msgDate);

    if (success) {
        $icon.text(base64Data ? "🧬" : "📝").css("color", base64Data ? "#b19cd9" : "#a8d8ea"); 
        toastr.success("样本已采集", "Singularity");
        refreshInterface(); 
        setTimeout(() => {
            $icon.text("👁️‍🗨️").css("color", "").css("opacity", 0.3);
        }, 3000);
    } else {
        $icon.text("⚠️");
        setTimeout(() => $icon.text("👁️‍🗨️"), 2000);
    }
});


let globalPlaylist = [];
let currentTrackIndex = -1;
let isRandomMode = false;
let audioPlayer = new Audio();
let isPlaying = false;

audioPlayer.onended = () => playNextTrack();

function playNextTrack() {
    if (globalPlaylist.length === 0) return;
    if (isRandomMode) {
        currentTrackIndex = Math.floor(Math.random() * globalPlaylist.length);
    } else {
        currentTrackIndex++;
        if (currentTrackIndex >= globalPlaylist.length) currentTrackIndex = 0;
    }
    playTrackByIndex(currentTrackIndex);
}

function playTrackByIndex(index) {
    if (index < 0 || index >= globalPlaylist.length) return;
    currentTrackIndex = index;
    const item = globalPlaylist[index];
    audioPlayer.src = item.data;
    audioPlayer.play();
    isPlaying = true;
    updatePlayerUI();
    
    // UI 高亮更新
    $(".hux-item").removeClass("playing");
    $(`.hux-item[data-id="${item.id}"]`).addClass("playing");
}

function togglePlay() {
    if (globalPlaylist.length === 0) return;
    if (audioPlayer.paused && audioPlayer.src) {
        audioPlayer.play();
        isPlaying = true;
    } else if (!audioPlayer.paused) {
        audioPlayer.pause();
        isPlaying = false;
    } else {
        playNextTrack();
    }
    updatePlayerUI();
}


// --- 导出 ZIP 逻辑---

function dataURItoBlob(dataURI) {
    try {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], {type: mimeString});
    } catch (e) {
        console.error("Blob conversion failed", e);
        return null;
    }
}

async function exportAsZip(charName, list) {
    if (typeof JSZip === 'undefined') {
        toastr.error("ZIP组件尚未加载，请刷新页面重试。", "Export Failed");
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder(`${charName}_Memories`);
    let audioCount = 0;
    
    toastr.info("正在打包记忆...", "Please Wait");

    let textLog = `=== ${charName} Memory Log ===\nExported: ${new Date().toLocaleString()}\n\n`;

    list.forEach((item, index) => {
        const dateStr = item.date.replace(/[\/:]/g, "-").split(' ')[0]; 
        const rawText = item.text.replace(/<[^>]*>/g, "").trim();
        const shortText = rawText.slice(0, 15).replace(/[\\/:*?"<>|]/g, "_"); 
        
        textLog += `[Track ${index+1}] ${item.date}\nContent: ${rawText}\n`;

        if (item.data) {
            const blob = dataURItoBlob(item.data);
            if (blob) {
                let ext = "wav"; 
                if (blob.type.includes("mp3")) ext = "mp3";
                else if (blob.type.includes("ogg")) ext = "ogg";
                
                const fileName = `${dateStr}_${index}_${shortText}.${ext}`;
                folder.file(fileName, blob);
                textLog += `File: ${fileName}\n`;
                audioCount++;
            }
        }
        textLog += `-----------------------------------\n`;
    });

    folder.file("00_Memory_Log.txt", textLog);

    try {
        const content = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${charName}_Voice_Pack_${Date.now()}.zip`;
        a.click();
        toastr.success(`成功导出 ${audioCount} 个音频文件！`, "Export Complete");
    } catch (e) {
        toastr.error("打包失败，请检查控制台。", "Error");
        console.error(e);
    }
}


function refreshInterface() {
    const context = getContext();
    const currentChar = context.name2;
    const settings = loadBiomass();
    const fullList = settings.biomass[currentChar] || [];
    
    globalPlaylist = fullList.filter(item => item.data); 

    let $drawer = $(`#${DRAWER_ID}`);

    const cssStyle = `
        :root {
            --hux-accent: var(--smart-theme-quote-color, #90caf9);
            --hux-bg-card: var(--bg-2);
            --hux-bg-hover: var(--bg-3);
            --hux-border: var(--border-color);
        }

        .hux-container {
            font-family: var(--font-body);
            background: var(--block-body);
            color: var(--text-body);
            border: 1px solid var(--hux-border);
            margin-top: 5px;
            display: flex;
            flex-direction: column;
        }
        
        .hux-controls {
            padding: 10px;
            background: var(--bg-1);
            border-bottom: 1px solid var(--hux-border);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* 按钮统一样式 */
        .hux-btn {
            cursor: pointer;
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 4px;
            background: var(--bg-2);
            border: 1px solid var(--hux-border);
            color: var(--text-body); /* 图标颜色跟随主题 */
            transition: all 0.1s;
            font-size: 1em; /* 图标大小 */
        }
        .hux-btn:hover { 
            background: var(--hux-bg-hover); 
            color: var(--hux-accent); /* 悬停时变色 */
        }
        .hux-btn.active { 
            background: var(--hux-accent); 
            color: var(--block-body); 
            border-color: var(--hux-accent);
        }
        
        .hux-status {
            flex-grow: 1; margin: 0 10px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            opacity: 0.7; font-size: 0.85em;
        }

        .hux-content-wrapper { display: block; }

        .hux-search-box {
            padding: 8px; background: var(--bg-1);
            border-bottom: 1px solid var(--hux-border);
        }
        .hux-search-input {
            width: 100%; padding: 6px 10px;
            border-radius: 4px; border: 1px solid var(--hux-border);
            background: var(--input-bg); color: var(--input-text);
        }

        .hux-list {
            max-height: 400px; overflow-y: auto; padding: 8px;
            background: var(--bg-0);
        }

        .hux-item {
            background: var(--hux-bg-card);
            border: 1px solid var(--hux-border);
            margin-bottom: 6px; border-radius: 4px;
            transition: transform 0.1s;
        }
        .hux-item:hover { border-color: var(--hux-accent); }
        .hux-item.playing { 
            border-left: 4px solid var(--hux-accent);
            background: var(--hux-bg-hover);
        }

        .hux-header {
            padding: 8px 10px; cursor: pointer;
            display: flex; align-items: center; gap: 10px; font-size: 0.9em;
        }
        
        .hux-date { 
            color: var(--hux-text-sub); font-size: 0.8em; opacity: 0.6;
            min-width: 80px;
        }
        .hux-preview { 
            flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
            text-align: left; font-weight: 500;
        }
        .hux-icon { font-size: 0.9em; opacity: 0.6; margin-left: auto; }

        .hux-body {
            display: none; padding: 10px;
            border-top: 1px dashed var(--hux-border);
            font-size: 0.9em; line-height: 1.5;
            background: rgba(0,0,0,0.05);
        }
        
        .hux-actions {
            display: flex; justify-content: flex-end; align-items: center;
            margin-top: 8px; gap: 10px;
        }
        .hux-del { color: #ff6b6b; cursor: pointer; font-size: 0.8em; }
        .hux-play-one { color: var(--hux-accent); cursor: pointer; font-size: 0.85em; font-weight: bold; }
    `;

    if ($("#hux-style").length === 0) $("head").append(`<style id="hux-style">${cssStyle}</style>`);
    else $("#hux-style").html(cssStyle);

    if ($drawer.length === 0) {
        $drawer = $(`<div id="${DRAWER_ID}" class="inline-drawer"></div>`);
        $("#extensions_settings").append($drawer);
    }

    const renderSkeleton = () => {
        let listHtml = '';
        if (fullList.length === 0) {
            listHtml = `<div style="padding:20px; text-align:center; opacity:0.5; font-size:0.9em;">Waiting for new memories...</div>`;
        } else {
            [...fullList].reverse().forEach(item => {
                const plainText = item.text.replace(/<[^>]*>/g, "").slice(0, 30);
                const hasAudio = !!item.data;
                const searchText = (item.text + " " + item.date).replace(/<[^>]*>/g, "").toLowerCase();
                const shortDate = item.date.split(' ')[0] || "Unknown";

                listHtml += `
                <div class="hux-item ${hasAudio ? 'has-audio' : ''}" data-id="${item.id}" data-search="${searchText.replace(/"/g, '&quot;')}">
                    <div class="hux-header">
                        <span class="hux-date">${shortDate}</span>
                        <span class="hux-preview">${plainText}</span>
                        <span class="hux-icon">${hasAudio ? '<i class="fa-solid fa-compact-disc"></i>' : '<i class="fa-regular fa-file-lines"></i>'}</span>
                    </div>
                    <div class="hux-body">
                        <div class="hux-text">${item.text}</div>
                        <div class="hux-actions">
                            ${hasAudio ? `<span class="hux-play-one" data-id="${item.id}"><i class="fa-solid fa-play"></i> 播放</span>` : ''}
                            <span class="hux-del" data-id="${item.id}"><i class="fa-solid fa-trash"></i> 删除</span>
                        </div>
                    </div>
                </div>`;
            });
        }

        const html = `
            <div class="hux-container">
                <div class="inline-drawer-header inline-drawer-toggle">
                    <b>👁️‍🗨️ ${currentChar} :: 奇点收藏</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                </div>
                
                <div class="hux-content-wrapper">
                    <div class="hux-controls">
                        <div class="hux-btn" id="hux-play-btn" title="播放/暂停">
                            <i class="fa-solid fa-play"></i>
                        </div>
                        <div class="hux-btn" id="hux-next-btn" title="下一条">
                            <i class="fa-solid fa-forward-step"></i>
                        </div>
                        <div class="hux-btn ${isRandomMode ? 'active' : ''}" id="hux-mode-btn" title="模式切换">
                           <i class="fa-solid ${isRandomMode ? 'fa-shuffle' : 'fa-repeat'}"></i>
                        </div>
                        
                        <div class="hux-status" id="hux-player-status">Waiting...</div>
                        
                        <div style="flex-grow:1"></div> 
                        
                        <div class="hux-btn" id="hux-export-txt" title="导出文本 (.txt)">
                            <i class="fa-solid fa-file-lines"></i>
                        </div>
                        <div class="hux-btn" id="hux-export-zip" title="导出音频 (.zip)">
                            <i class="fa-solid fa-file-zipper"></i>
                        </div>
                    </div>

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
                if ($wrapper.is(":visible")) $icon.removeClass("fa-circle-chevron-right").addClass("fa-circle-chevron-down");
                else $icon.removeClass("fa-circle-chevron-down").addClass("fa-circle-chevron-right");
            });
        });

        $drawer.find("#hux-search-bar").on("input", function() {
            const val = $(this).val().toLowerCase();
            $drawer.find(".hux-item").each(function() {
                const $item = $(this);
                const searchContent = $item.data("search");
                if (searchContent.includes(val)) $item.show();
                else $item.hide();
            });
        });

        $drawer.find(".hux-header").on("click", function() {
            $(this).next(".hux-body").slideToggle(150);
        });

        $drawer.find(".hux-del").on("click", function(e) {
            e.stopPropagation();
            if (confirm("删除这条记忆？")) {
                const id = $(this).data("id");
                settings.biomass[currentChar] = settings.biomass[currentChar].filter(x => x.id !== id);
                saveBiomass(settings);
                refreshInterface();
            }
        });

        $drawer.find(".hux-play-one").on("click", function(e) {
            e.stopPropagation();
            const id = $(this).data("id");
            const index = globalPlaylist.findIndex(x => x.id === id);
            if (index !== -1) playTrackByIndex(index);
        });

        $drawer.find("#hux-play-btn").on("click", togglePlay);
        $drawer.find("#hux-next-btn").on("click", () => playNextTrack());
        
        $drawer.find("#hux-mode-btn").on("click", function() {
            isRandomMode = !isRandomMode;
            $(this).toggleClass("active");
            const $icon = $(this).find("i");
            if (isRandomMode) {
                $icon.removeClass("fa-repeat").addClass("fa-shuffle");
                $(this).attr("title", "当前：随机播放");
            } else {
                $icon.removeClass("fa-shuffle").addClass("fa-repeat");
                $(this).attr("title", "当前：顺序播放");
            }
        });

        $drawer.find("#hux-export-txt").on("click", () => {
             let content = `=== ${currentChar} :: Memory Log ===\n\n`;
             fullList.forEach(item => {
                 content += `[${item.date}]\n${item.text.replace(/<[^>]*>/g, "")}\n-------------------\n`;
             });
             const blob = new Blob([content], { type: "text/plain" });
             const a = document.createElement("a");
             a.href = URL.createObjectURL(blob);
             a.download = `${currentChar}_Log_${Date.now()}.txt`;
             a.click();
        });
        
        $drawer.find("#hux-export-zip").on("click", () => exportAsZip(currentChar, fullList));
        if (isPlaying) {
             $drawer.find("#hux-play-btn").html('<i class="fa-solid fa-pause"></i>');
             updatePlayerUI(); 
        }
    };

    renderSkeleton();
}

function updatePlayerUI() {
    const $btnPlay = $("#hux-play-btn");
    const $status = $("#hux-player-status");
    $btnPlay.html(isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>');
    
    if (currentTrackIndex >= 0 && globalPlaylist[currentTrackIndex]) {
        const text = globalPlaylist[currentTrackIndex].text.replace(/<[^>]*>/g, "").slice(0, 15);
        $status.text(`🎵 ${text}...`);
    } else {
        $status.text("💤 Ready...");
    }
}

// --- 🚀 启动 ---
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
