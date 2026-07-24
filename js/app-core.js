let lastLandingState = null;
function syncLoop() {
    if (wasmReady) {
        // Sync Active View Mode (reads instantly from _state cache)
        try {
            const activeView = _state.currentView;
            const appRootEl = document.getElementById('app-root');
            const isLanding = !!(appRootEl && appRootEl.classList.contains('landing'));

            // Re-run the view switch either when the numeric view mode
            // changes, OR when we transition into/out of the landing
            // screen with the same view mode still selected (e.g. typing
            // an expression while "Simulation" stays the active nav
            // button) — otherwise the panel never gets revealed once
            // landing is removed, since handleViewChange() bails out
            // while landing is active and nothing else re-triggers it.
            if (activeView !== lastActiveView || isLanding !== lastLandingState) {
                lastActiveView = activeView;
                lastLandingState = isLanding;
                elements.navButtons.forEach(btn => {
                    const btnView = parseInt(btn.getAttribute('data-view'));
                    if (btnView === activeView) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                handleViewChange(activeView);
            }
        } catch (e) {
            console.error('[Mantiq] syncLoop error:', e);
        }
    }
    requestAnimationFrame(syncLoop);
}

window.onMantiqInit = function() {
    // wasmReady already set to true by the worker bridge above
    console.log('[Mantiq] WASM Engine fully active in worker thread.');

    // Dismiss loading overlay
    var overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        setTimeout(() => overlay.remove(), 600);
    }

    // Initial load from Hash
    if (window.location.hash.startsWith('#expr=')) {
        const initialExpr = decodeURIComponent(window.location.hash.substring(6));
        if (initialExpr.trim() !== '') {
            elements.input.value = initialExpr;
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.classList.remove('landing');
            }
            const clearBtn = document.getElementById('clear-input-btn');
            if (clearBtn) {
                clearBtn.style.display = 'flex';
            }
            Module.ccall('mantiq_setExpression', null, ['string'], [initialExpr]);
        }
    }

    // Set Default active view
    Module.ccall('mantiq_setView', null, ['number'], [0]); // Simulation
    
    // ── FORCE INITIAL LAYOUT REFLOW ON STARTUP ──
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        if (typeof fitToContainer === 'function') {
            fitToContainer('simOrig');
            fitToContainer('simSimp');
        }
    });

    // Start syncing loop
    requestAnimationFrame(syncLoop);
};

// State transitions fade helper
function changeState(actionFn) {
    const mainWorkspace = document.getElementById('main-workspace');
    if (mainWorkspace) {
        mainWorkspace.classList.add('fade-out');
        setTimeout(() => {
            actionFn();
            requestAnimationFrame(() => {
                setTimeout(() => {
                    mainWorkspace.classList.remove('fade-out');
                }, 40);
            });
        }, 150);
    } else {
        actionFn();
    }
}

// Event Listeners
elements.input.addEventListener('input', (e) => {
    const expr = e.target.value;
    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) {
        clearBtn.style.display = expr.trim() !== '' ? 'flex' : 'none';
    }
    
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
        if (expr.trim() !== '') {
            appRoot.classList.remove('showing-examples');
        } else if (!appRoot.classList.contains('landing')) {
            // Input was cleared out entirely - go back to the landing screen
            // right away, no need to wait on anything.
            changeState(() => {
                appRoot.classList.add('landing');
            });
        }
        // Note: leaving the landing screen for a non-empty expression is
        // handled in updateFrontend() once the expression is confirmed valid
        // (hasResult) and only after that view has actually been rendered -
        // not here on every keystroke - so an invalid or still-computing
        // expression never flashes an empty/laggy main page.
    }
    
    if (!wasmReady) return;
    Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
    updateFrontend();
});

// Clear input button
const clearBtn = document.getElementById('clear-input-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        changeState(() => {
            elements.input.value = '';
            clearBtn.style.display = 'none';
            
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.classList.add('landing');
                appRoot.classList.remove('showing-examples');
            }
            
            window.history.replaceState(null, null, ' ');
            
            if (wasmReady) {
                Module.ccall('mantiq_setExpression', null, ['string'], ['']);
                updateFrontend();
            }
        });
        
        elements.input.focus();
    });
}

// Logo click to return to landing page
const heroLogoWrap = document.getElementById('hero-logo-wrap');
if (heroLogoWrap) {
    heroLogoWrap.addEventListener('click', (e) => {
        e.preventDefault();
        const appRoot = document.getElementById('app-root');
        
        // Only trigger if we aren't already on the landing page
        if (appRoot && !appRoot.classList.contains('landing')) {
            changeState(() => {
                elements.input.value = '';
                const cBtn = document.getElementById('clear-input-btn');
                if (cBtn) cBtn.style.display = 'none';
                
                appRoot.classList.add('landing');
                appRoot.classList.remove('showing-examples');
                
                window.history.replaceState(null, null, ' ');
                
                if (wasmReady) {
                    Module.ccall('mantiq_setExpression', null, ['string'], ['']);
                    updateFrontend();
                }
            });
            // Intentionally not calling focus() here so the mobile keyboard doesn't randomly pop up
        }
    });
}

// Keyboard escape handlers
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        elements.altPopup.style.display = 'none';
        document.getElementById('share-popup').style.display = 'none';
        const formatGuidePopup = document.getElementById('format-guide-popup');
        if (formatGuidePopup) formatGuidePopup.style.display = 'none';
        const examplesPopup = document.getElementById('examples-popup');
        if (examplesPopup) examplesPopup.style.display = 'none';
    }
});

 

if (elements.sopPosPill) {
    elements.sopPosPill.addEventListener('click', () => {
        const isSop = elements.sopPosPill.getAttribute('data-state') === 'sop';
        const newState = isSop ? 'pos' : 'sop';
        
        elements.sopPosPill.setAttribute('data-state', newState);
        elements.sopPosPill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newState);
        });
        
        // Mantiq setSOP API: 1 = SOP, 0 = POS
        if (wasmReady) {
            Module.ccall('mantiq_setSOP', null, ['number'], [newState === 'sop' ? 1 : 0]);
            
            const expr = elements.input.value.trim();
            if (expr) {
                Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
                updateFrontend();
            }
        }
    });
}

// Theme Toggle Pill
if (elements.themePill) {
    // Force the correct theme class on load to match the pill's initial
    // data-state="dark" — without this, a browser/OS reporting a light
    // color-scheme preference silently overrides :root to light values
    // before any click ever happens, so the page can start in light mode
    // even though the toggle shows "Dark" as selected.
    document.body.classList.toggle('dark-mode', elements.themePill.getAttribute('data-state') === 'dark');
    document.body.classList.toggle('light-mode', elements.themePill.getAttribute('data-state') === 'light');

    elements.themePill.addEventListener('click', () => {
        const isDark = elements.themePill.getAttribute('data-state') === 'dark';
        const newState = isDark ? 'light' : 'dark';

        document.body.classList.toggle('light-mode', newState === 'light');
        document.body.classList.toggle('dark-mode', newState === 'dark');

        elements.themePill.setAttribute('data-state', newState);
        elements.themePill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newState);
        });

        if (typeof lastTruthTableData !== 'undefined' && lastTruthTableData) {
            renderHTMLWaveform(lastTruthTableData);
        }
    });
}

// Automatically repaint waveform canvas whenever theme classes change on document.body
if (typeof window !== 'undefined' && window.MutationObserver) {
    const bodyThemeObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class' && typeof lastTruthTableData !== 'undefined' && lastTruthTableData) {
                renderHTMLWaveform(lastTruthTableData);
                break;
            }
        }
    });
    bodyThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// Solution View Mobile Tab Toggle
const solutionTypePill = document.getElementById('solution-type-pill');
if (solutionTypePill) {
    solutionTypePill.addEventListener('click', (e) => {
        const targetOption = e.target.closest('.pill-option');
        if (!targetOption) return;
        
        const newVal = targetOption.getAttribute('data-val');
        solutionTypePill.setAttribute('data-state', newVal);
        solutionTypePill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newVal);
        });
        
        const splitView = document.getElementById('solution-split-view');
        if (splitView) {
            splitView.setAttribute('data-active-tab', newVal);
        }
    });
}

// K-Map View Mode Toggle (Normal / Wrap / 3D).
const kmapViewToggleBtn = document.getElementById('kmap-view-toggle-btn');
if (kmapViewToggleBtn) {
    kmapViewToggleBtn.addEventListener('click', () => {
        const numVars = lastKMapData ? lastKMapData.variables.length : 0;
        if (kmapViewMode === 'normal') {
            kmapViewMode = numVars <= 4 ? 'wrap' : '3d';
        } else {
            kmapViewMode = 'normal';
        }
        renderHTMLKMap();
    });
}


// Keep the K-Map view perfectly fit to its panel whenever the panel's
// size changes for ANY reason (window resize, sidebar collapse/expand,
// orientation change, etc.) rather than only when we explicitly re-render.
let kmapResizePending = false;
function resizeKMapView() {
    if (!lastKMapData) return;
    const kmapContainer = document.getElementById('kmap-container');
    if (!kmapContainer || kmapContainer.classList.contains('view-hidden')) return;

    const { variables, minterms, dontCares, solutions, solutionsPOS } = lastKMapData;
    const numVars = variables.length;

    const sopPosEl = document.getElementById('sop-pos-pill');
    const isSOP = sopPosEl ? sopPosEl.getAttribute('data-state') === 'sop' : true;
    const activeSolutions = isSOP ? solutions : solutionsPOS;
    let selectedIdx = typeof selectedSolutionIndex !== 'undefined' ? selectedSolutionIndex : 0;
    if (selectedIdx >= activeSolutions.length) selectedIdx = 0;
    const activeSolution = activeSolutions.length > 0 ? activeSolutions[selectedIdx] : [];

    if (numVars <= 4) {
        if (kmapViewMode === 'wrap') {
            renderWrapKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP);
        } else {
            render2DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP, true);
        }
    } else if (kmapViewMode !== '3d') {
        renderMultiple2DKMaps(numVars, variables, minterms, dontCares, activeSolution, isSOP);
    }
}

const kmapVisualWrapperEl = document.getElementById('kmap-visual-wrapper');
if (kmapVisualWrapperEl && window.ResizeObserver) {
    const kmapResizeObserver = new ResizeObserver(() => {
        if (kmapResizePending) return;
        kmapResizePending = true;
        requestAnimationFrame(() => {
            kmapResizePending = false;
            resizeKMapView();
        });
    });
    kmapResizeObserver.observe(kmapVisualWrapperEl);
}

// Keep the waveform canvas perfectly fit to its panel whenever the panel's
// size changes for ANY reason (window resize, sidebar collapse/expand,
// orientation change, mobile viewport chrome show/hide, etc.) - previously
// it was only ever sized once, at render time, so it went stale on mobile
// the moment the layout changed after that.
let waveResizePending = false;
const waveScrollWrapperEl = document.querySelector('.wave-scroll-wrapper');
if (waveScrollWrapperEl && window.ResizeObserver) {
    const waveResizeObserver = new ResizeObserver(() => {
        if (waveResizePending) return;
        waveResizePending = true;
        requestAnimationFrame(() => {
            waveResizePending = false;
            if (lastTruthTableData) renderHTMLWaveform(lastTruthTableData);
        });
    });
    waveResizeObserver.observe(waveScrollWrapperEl);
}

// K-Map panel fullscreen toggle - expands the whole K-Map panel (2D, Wrap,
// or 3D view, whichever is active) to fill the viewport. Reuses the panel
// in place (rather than cloning into the shared #panel-fullscreen-overlay
// like the circuit/simulation panels do) since the K-Map's grid/3D canvas
// aren't built on the .zoom-content-wrapper pattern that overlay expects.
(function initKMapFullscreen() {
    const btn = document.getElementById('kmap-fullscreen-btn');
    const panel = document.querySelector('#kmap-container .kmap-panel');
    if (!btn || !panel) return;

    // #kmap-container (and everything in it) sits inside a z-index:8
    // stacking context. A descendant can set z-index: 999999 and it still
    // won't paint above siblings like the topbar/sidebar (z-index:10),
    // because stacking order is resolved within the nearest ancestor
    // stacking context first - position:fixed only escapes that context
    // for LAYOUT (viewport-relative coordinates), not for paint order. So
    // to actually cover everything, the panel itself is relocated to be a
    // direct child of <body> while fullscreen, then moved back afterwards.
    const anchor = document.createComment('kmap-panel-anchor');
    let isDetached = false;

    const notifyResize = () => {
        // The K-Map's own ResizeObserver picks up the panel's new size
        // automatically; the 3D view only listens for window resize events,
        // so dispatch one to make sure its canvas/camera catch up too.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
    };

    const setFullscreen = (on) => {
        if (on && !isDetached) {
            panel.parentNode.insertBefore(anchor, panel);
            document.body.appendChild(panel);
            isDetached = true;
        } else if (!on && isDetached) {
            anchor.parentNode.insertBefore(panel, anchor);
            anchor.remove();
            isDetached = false;
        }
        panel.classList.toggle('kmap-panel-fullscreen', on);
        btn.classList.toggle('active', on);
        btn.title = on ? 'Exit Fullscreen' : 'Fullscreen';
        document.body.style.overflow = on ? 'hidden' : '';
        notifyResize();
    };

    btn.addEventListener('click', () => {
        setFullscreen(!isDetached);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDetached) {
            setFullscreen(false);
        }
    });
})();

// Sidebar is now fixed-width (no expand/collapse toggle)

// Fix Backspace / Key events being stolen by Emscripten/Raylib
// We must use capturing phase on window/document to intercept before Emscripten
['keydown', 'keyup', 'keypress'].forEach(evt => {
    window.addEventListener(evt, (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.stopImmediatePropagation();
        }
    }, true);
    document.addEventListener(evt, (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.stopImmediatePropagation();
        }
    }, true);
});



// Sidebar Buttons View Mode changes
elements.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (!wasmReady) return;
        const currentExprStr = (_state.expression || (elements.input && elements.input.value) || '').trim();
        const isKmapInput = currentExprStr.toUpperCase().includes('KMAP');
        const viewMode = parseInt(e.currentTarget.getAttribute('data-view'));

        if (isKmapInput && viewMode !== 2) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (e.currentTarget.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        elements.navButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        Module.ccall('mantiq_setView', null, ['number'], [viewMode]);
        lastActiveView = viewMode;
        handleViewChange(viewMode);
    });
});

// ── Algebraic Proof Rule Explanation Modal ──────────────────────────────────
