function generateSVGForSimulation(root, panelId = 'p', panelType = 'simOrig') {
    if (!root) return '';
    
    const levelMap = new Map();
    function computeDepth(node) {
        if (!node.isGate) {
            levelMap.set(node, 0);
            return 0;
        }
        let maxChildDepth = -1;
        if (node.children) {
            for (const child of node.children) {
                maxChildDepth = Math.max(maxChildDepth, computeDepth(child));
            }
        }
        const d = maxChildDepth + 1;
        levelMap.set(node, d);
        return d;
    }
    computeDepth(root);
    
    const depthGroups = [];
    for (const [node, d] of levelMap.entries()) {
        while (depthGroups.length <= d) depthGroups.push([]);
        depthGroups[d].push(node);
    }
    
    const spacingY = 55;
    const posMap = new Map(); 
    
    if (depthGroups[0]) {
        for (let i = 0; i < depthGroups[0].length; i++) {
            posMap.set(depthGroups[0][i], { x: 0, y: i * spacingY });
        }
    }
    
    function getNodeWidth(n) {
        if (!n.isGate) return 24;
        const numInputs = n.children ? n.children.length : 2;
        let r = 25;
        if (numInputs === 3) r = 30;
        else if (numInputs === 4) r = 35;
        else if (numInputs > 4) r = 40;
        return r + 12;
    }

    const levelX = [0];
    for (let d = 1; d < depthGroups.length; d++) {
        let maxRight = 0;
        for (const prevNode of depthGroups[d-1]) {
            const prevPos = posMap.get(prevNode);
            if (prevPos) {
                const w = getNodeWidth(prevNode);
                if (prevPos.x + w > maxRight) {
                    maxRight = prevPos.x + w;
                }
            }
        }
        levelX[d] = maxRight + 65; // 65px clearance for trace + parent input pin

        for (const node of depthGroups[d]) {
            if (node.children) {
                const numC = node.children.length;
                let targetY = 0;
                if (numC === 2) {
                    targetY = (posMap.get(node.children[0]).y + posMap.get(node.children[1]).y) / 2;
                } else if (numC === 3) {
                    targetY = posMap.get(node.children[1]).y;
                } else if (numC === 4) {
                    targetY = (posMap.get(node.children[1]).y + posMap.get(node.children[2]).y) / 2;
                } else {
                    let sumY = 0;
                    for (const child of node.children) sumY += posMap.get(child).y;
                    targetY = sumY / numC;
                }
                posMap.set(node, { x: levelX[d], y: targetY });
            }
        }
    }
    for (let d = 1; d < depthGroups.length; d++) {
        depthGroups[d].sort((a, b) => posMap.get(a).y - posMap.get(b).y);
        for (let i = 1; i < depthGroups[d].length; i++) {
            const prev = posMap.get(depthGroups[d][i-1]);
            const curr = posMap.get(depthGroups[d][i]);
            if (curr.y < prev.y + spacingY) curr.y = prev.y + spacingY;
        }
    }
    
    let contentMinX = Infinity;
    let contentMaxX = -Infinity;
    let contentMinY = Infinity;
    let contentMaxY = -Infinity;
    
    for (const [node, pos] of posMap.entries()) {
        let left = pos.x;
        let right = pos.x;
        let top = pos.y;
        let bottom = pos.y;
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            if (isConst) {
                left = pos.x - 18;
                right = pos.x + 18;
                top = pos.y - 18;
                bottom = pos.y + 32;
            } else {
                left = pos.x - 65; // label at x-35, end-aligned
                right = pos.x + 24;
                top = pos.y - 24;
                bottom = pos.y + 24;
            }
        } else {
            left = pos.x - 35;
            right = getGateOutputPinRange(node.type, pos.x, node.children ? node.children.length : 2).endX;
            top = pos.y - 28;
            bottom = pos.y + 25;
        }
        
        if (node === root) {
            const rootOutX = root.isGate ? getGateOutputPinRange(root.type, pos.x, root.children ? root.children.length : 2).endX : pos.x;
            const extraOutLen = root.isGate ? 0 : 80;
            const ledX = rootOutX + 40 + extraOutLen; 
            right = ledX + 25;
            bottom = Math.max(bottom, pos.y + 35);
        }
        
        contentMinX = Math.min(contentMinX, left);
        contentMaxX = Math.max(contentMaxX, right);
        contentMinY = Math.min(contentMinY, top);
        contentMaxY = Math.max(contentMaxY, bottom);
    }
    
    const pcbPadding = 50; 
    const width = (contentMaxX - contentMinX) + pcbPadding * 2;
    const height = (contentMaxY - contentMinY) + pcbPadding * 2;
    const dx = pcbPadding - contentMinX;
    const dy = pcbPadding - contentMinY;
    
    let svgContent = `
        <defs>
            <!-- Copper pad holes -->
            <pattern id="pcb-holes-${panelId}" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1.5" fill="#051005" opacity="0.8"/>
            </pattern>

            <!-- Metallic pin/leg -->
            <linearGradient id="metal-pin-${panelId}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#888" />
                <stop offset="30%" stop-color="#ddd" />
                <stop offset="70%" stop-color="#555" />
                <stop offset="100%" stop-color="#333" />
            </linearGradient>

            <!-- Golden Plated Copper Pad -->
            <linearGradient id="metal-pad-${panelId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffe680" />
                <stop offset="50%" stop-color="#d4af37" />
                <stop offset="100%" stop-color="#aa8011" />
            </linearGradient>

            <!-- 3D Bevel & Shadow for IC plastic bodies -->
            <filter id="plastic-3d-${panelId}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.8" specularExponent="25" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-2000" y="-2000" z="1000"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <feDropShadow dx="3" dy="5" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
            </filter>

            <!-- 3D Bevel for Button Caps (rounded, smooth) -->
            <filter id="btn-cap-3d-${panelId}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="4" specularConstant="1.2" specularExponent="15" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-50" y="-50" z="50"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/>
            </filter>

            <!-- Active Trace 3D (Glowing Green PCB Wire) -->
            <!-- userSpaceOnUse, not bbox-relative: a straight horizontal trace
                 (e.g. the single input into a NOT gate) has a near-zero-height
                 geometric bounding box, so a percentage-based region clips the
                 blur/glow almost entirely. Padding is sized to the panel's own
                 canvas instead of a fixed 2500x2500, so it still shrinks for
                 small/medium circuits. -->
            <filter id="trace-3d-active-${panelId}" filterUnits="userSpaceOnUse" x="${-50}" y="${-50}" width="${width + 100}" height="${height + 100}">
                <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.6" result="shadow"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="20" lighting-color="#a5d6a7" result="specOut">
                    <fePointLight x="-500" y="-500" z="300"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <!-- Green Glow halo -->
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="glow"/>
                <feMerge>
                    <feMergeNode in="shadow"/>
                    <feMergeNode in="glow"/>
                    <feMergeNode in="litPaint"/>
                </feMerge>
            </filter>

            <!-- Inactive Trace 3D (Light Green Trace under solder mask) -->
            <filter id="trace-3d-inactive-${panelId}" filterUnits="userSpaceOnUse" x="${-50}" y="${-50}" width="${width + 100}" height="${height + 100}">
                <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="1.5" specularConstant="0.8" specularExponent="15" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-500" y="-500" z="300"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
            </filter>

            <!-- LED ON glow -->
            <filter id="led-glow-${panelId}" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="12" result="blur"/>
                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>
            <filter id="led-glow-small-${panelId}" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>

            <radialGradient id="led-on-${panelId}" cx="35%" cy="30%" r="65%" fx="30%" fy="25%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="15%" stop-color="#ffdd44"/>
                <stop offset="45%" stop-color="#ff4400"/>
                <stop offset="100%" stop-color="#991100"/>
            </radialGradient>

            <radialGradient id="led-off-${panelId}" cx="35%" cy="30%" r="65%" fx="30%" fy="25%">
                <stop offset="0%" stop-color="#662222"/>
                <stop offset="60%" stop-color="#220000"/>
                <stop offset="100%" stop-color="#050000"/>
            </radialGradient>
            
            <!-- Silkscreen Emboss: no shadow, just a clean label -->
            <filter id="silkscreen-${panelId}">
                <feComposite in="SourceGraphic" in2="SourceGraphic" operator="over"/>
            </filter>
        </defs>

        <!-- PCB shadow: plain dark rect offset behind the board (no filter, works on all GPUs) -->
        <rect x="${10}" y="${14}" width="${width}" height="${height}" fill="#030d05" rx="14" opacity="0.65"/>
        <!-- PCB Board -->
        <rect x="0" y="0" width="${width}" height="${height}" fill="#246b3e" rx="12" />
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#pcb-holes-${panelId})" rx="12" opacity="0.4"/>
        <!-- PCB mounting holes at corners (gold ring, dark hole) -->
        <circle cx="16" cy="16" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="16" cy="16" r="3.5" fill="#051005"/>
        <circle cx="${width-16}" cy="16" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="${width-16}" cy="16" r="3.5" fill="#051005"/>
        <circle cx="16" cy="${height-16}" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="16" cy="${height-16}" r="3.5" fill="#051005"/>
        <circle cx="${width-16}" cy="${height-16}" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="${width-16}" cy="${height-16}" r="3.5" fill="#051005"/>
    `;
    
    // --- DRAW COPPER TRACES ---
    // Each node gets a stable index (its position in posMap's iteration order,
    // which is deterministic for a given tree) so toggleSimInput can look these
    // paths back up by id later without re-walking/re-stringifying the tree.
    {
        let traceIdx = 0;
        for (const [node, pos] of posMap.entries()) {
            const myIdx = traceIdx++;
            if (node.isGate && node.children) {
                const tx = pos.x + dx;
                const ty = pos.y + dy;
                const numInputs = node.children.length;
                const portSpacing = 18;
                const startPortY = ty - ((numInputs - 1) * portSpacing) / 2;

                for (let i = 0; i < numInputs; i++) {
                    const child = node.children[i];
                    const childPos = posMap.get(child);
                    const cX = childPos.x + dx;
                    const cY = childPos.y + dy;

                    let sourceX = child.isGate ? getGateOutputPinRange(child.type, cX, child.children ? child.children.length : 2).endX : cX;
                    const targetY = startPortY + i * portSpacing;
                    // Add a tiny 0.5px vertical offset to avoid 0-height SVG bounding box clipping by filters
                    const adjustedTargetY = (cY === targetY) ? targetY + 0.5 : targetY;
                    let midX = Math.max(sourceX + 12, tx - 42);
                    if (numInputs === 4 && (i === 1 || i === 2)) {
                        midX = Math.max(sourceX + 5, tx - 58);
                    }
                    const endX = tx - 35;

                    const childState = evaluateSimLogic(child);
                    const traceId = `trace-${panelId}-${myIdx}-${i}`;

                    if (childState) {
                        svgContent += `<path id="${traceId}" d="M ${sourceX} ${cY} L ${midX} ${cY} L ${midX} ${adjustedTargetY} L ${endX} ${adjustedTargetY}" fill="none" stroke="#4ade80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-active-${panelId})"/>`;
                    } else {
                        svgContent += `<path id="${traceId}" d="M ${sourceX} ${cY} L ${midX} ${cY} L ${midX} ${adjustedTargetY} L ${endX} ${adjustedTargetY}" fill="none" stroke="#154c27" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-inactive-${panelId})"/>`;
                    }
                }
            }
        }
    }

        // --- OUTPUT TRACE ---
    const rootPos = posMap.get(root);
    const rootX = rootPos.x + dx;
    const rootY = rootPos.y + dy;
    const finalState = evaluateSimLogic(root);
    const rootOutX = root.isGate ? getGateOutputPinRange(root.type, rootX, root.children ? root.children.length : 2).endX : rootX;
    const extraOutLen = root.isGate ? 0 : 80;
    const ledX = rootOutX + 40 + extraOutLen; 
    const ledY = rootY;
    
    // OUTPUT TRACE: runs straight horizontally to the left edge of the LED dome
    const traceEndX = ledX - 18;
    const adjustedTraceEndY = (rootY === rootY) ? rootY + 0.5 : rootY; // prevent 0-height filter clip
    
    if (finalState) {
        svgContent += `<path id="output-trace-${panelId}" d="M ${rootOutX} ${rootY} L ${traceEndX} ${adjustedTraceEndY}" fill="none" stroke="#4ade80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-active-${panelId})"/>`;
    } else {
        svgContent += `<path id="output-trace-${panelId}" d="M ${rootOutX} ${rootY} L ${traceEndX} ${adjustedTraceEndY}" fill="none" stroke="#154c27" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-inactive-${panelId})"/>`;
    }
    
    // --- DRAW SILKSCREEN OUTLINES & SOLDER PADS ---
    for (const [node, pos] of posMap.entries()) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            if (isConst) {
                svgContent += `<circle cx="${x}" cy="${y}" r="18" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;
            } else {
                svgContent += `<rect x="${x-24}" y="${y-24}" width="48" height="48" rx="7" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;
            }
        } else {
            svgContent += getSimGateSilkscreen(node.type, x, y, panelId, node.children ? node.children.length : 2);
        }
    }

    // --- DRAW COMPONENTS (ICs & Buttons) ---
    // componentIdx walks posMap in the same order/index as the copper-traces
    // loop above, so a given node gets the same index in both — toggleSimInput
    // relies on that to find the right elements by id.
    let componentIdx = 0;
    for (const [node, pos] of posMap.entries()) {
        const myIdx = componentIdx++;
        const x = pos.x + dx;
        const y = pos.y + dy;
        const state = evaluateSimLogic(node);
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            
            if (isConst) {
                // VCC / GND Terminal Posts
                const label = state ? 'VCC' : 'GND';
                const color = state ? '#20c060' : '#c02020';
                svgContent += `
                    <circle cx="${x}" cy="${y}" r="16" fill="url(#metal-pin-${panelId})" filter="url(#plastic-3d-${panelId})"/>
                    <circle cx="${x}" cy="${y}" r="10" fill="#111" filter="url(#plastic-3d-${panelId})"/>
                    <text x="${x}" y="${y+32}" font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold" fill="${color}" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${label}</text>
                `;
            } else {
                const varName = node.value;
                // Unpressed: cap floats above center. Pressed: cap sits at center.
                const capCY = state ? y : y - 4;
                const statusDot = `<circle id="toggle-dot-${panelId}-${myIdx}" cx="${x+13}" cy="${y-13}" r="3.5" fill="${state ? '#30d158' : '#ff453a'}" filter="url(#led-glow-small-${panelId})"/>`;
                svgContent += `
                    <g class="sim-toggle" data-var="${varName}" style="cursor:pointer;">
                        <!-- Solder legs -->
                        <rect x="${x-24}" y="${y-5}" width="5" height="10" rx="1.5" fill="url(#metal-pin-${panelId})" opacity="0.85"/>
                        <rect x="${x+19}" y="${y-5}" width="5" height="10" rx="1.5" fill="url(#metal-pin-${panelId})" opacity="0.85"/>
                        <!-- Housing (fixed) -->
                        <rect x="${x-22}" y="${y-22}" width="44" height="44" rx="6" fill="#151515" filter="url(#plastic-3d-${panelId})"/>
                        <!-- Cap circle -->
                        <circle id="toggle-cap-${panelId}-${myIdx}" cx="${x}" cy="${capCY}" r="13" fill="#333" filter="url(#btn-cap-3d-${panelId})"/>
                        <!-- Status dot -->
                        ${statusDot}
                        <!-- Label -->
                        <text x="${x-35}" y="${y}" font-family="Outfit,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="end" dominant-baseline="central" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${varName}</text>
                    </g>
                `;
            }
        } else {
            // Logic Gate IC
            const numInputs = node.children ? node.children.length : 0;
            const portSpacing = 18;
            const startPortY = y - ((numInputs - 1) * portSpacing) / 2;
            
            // Draw input pins
            for (let i = 0; i < numInputs; i++) {
                const py = startPortY + i * portSpacing;
                const pinStartX = x - 35;
                const pinEndX = x - 15;
                svgContent += `<rect x="${pinStartX}" y="${py - 2}" width="${pinEndX - pinStartX}" height="4" fill="url(#metal-pin-${panelId})" filter="url(#trace-3d-inactive-${panelId})"/>`;
            }
            // Draw output pin
            const pinRange = getGateOutputPinRange(node.type, x, numInputs);
            svgContent += `<rect x="${pinRange.startX}" y="${y - 2}" width="${pinRange.endX - pinRange.startX}" height="4" fill="url(#metal-pin-${panelId})" filter="url(#trace-3d-inactive-${panelId})"/>`;
            
            // Gate body
            svgContent += getSimGateShape(node.type, x, y, panelId, numInputs);
            
            // Silkscreen type label
            svgContent += `<text x="${x}" y="${y - 28}" font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold" fill="#ddd" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${node.type}</text>`;
            
            // Active status LED on the IC itself (Centered on the gate body)
            const dotX = x - 5;
            if (state) {
                svgContent += `<circle id="gate-dot-${panelId}-${myIdx}" cx="${dotX}" cy="${y}" r="2.5" fill="#60ff60" filter="url(#led-glow-small-${panelId})"/>`;
            } else {
                svgContent += `<circle id="gate-dot-${panelId}-${myIdx}" cx="${dotX}" cy="${y}" r="2.5" fill="#113311"/>`;
            }
        }
    }
    
    
    // --- 3D OUTPUT LED ---
    // Silkscreen outline for LED
    svgContent += `<circle cx="${ledX}" cy="${ledY}" r="21" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;

    // LED legs removed — LED is a through-hole component, no legs shown
    
    // LED Base ring (plastic collar)
    svgContent += `<ellipse id="led-base-${panelId}" cx="${ledX}" cy="${ledY}" rx="18" ry="18" fill="${finalState ? '#882200' : '#220000'}" filter="url(#plastic-3d-${panelId})"/>`;
    
    // LED Dome
    svgContent += `<circle id="led-dome-${panelId}" cx="${ledX}" cy="${ledY}" r="15" fill="${finalState ? 'url(#led-on-' + panelId + ')' : 'url(#led-off-' + panelId + ')'}" filter="url(#btn-cap-3d-${panelId})"/>`;
    
    // Ambient glow (yellow-orange, matches real LED colour). Always present
    // (opacity toggled) rather than conditionally appended, so a state flip
    // is a single attribute write instead of an add/remove.
    svgContent += `<circle id="led-glow-circle-${panelId}" cx="${ledX}" cy="${ledY}" r="45" fill="#ffe000" opacity="${finalState ? '0.35' : '0'}" filter="url(#led-glow-${panelId})" style="pointer-events: none;"/>`;
    
    // Silkscreen Label
    svgContent += `<text x="${ledX}" y="${ledY - 26}" font-family="Outfit,sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">OUTPUT</text>`;
    
    // Cache the layout (node positions + offsets) this render computed, keyed
    // by panelId, so toggleSimInput can recolor the existing DOM in place on
    // the next click instead of recomputing depth/positions and re-stringifying
    // the whole SVG. Safe to key by insertion-order index because posMap is a
    // Map — iterating it again later yields nodes in this exact same order.
    _simLayoutCache[panelId] = { root, posMap, dx, dy };

    // Total SVG canvas must include the shadow overhang (10px right, 14px down)
    const svgW = width + 10;
    const svgH = height + 14;
    const fitStyle = _calcFitStyle(panelType, svgW, svgH);
    return `
        <div class="zoom-content-wrapper" style="${fitStyle} will-change: transform;">
            <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="position: absolute; left: 0; top: 0;">
                ${svgContent}
            </svg>
        </div>
    `;
}

// -----------------------------------------------------------------------------
// Drag-to-Scroll Logic for Solutions Carousel
// -----------------------------------------------------------------------------
if (elements.solutionsCarousel) {
    let isDown = false;
    let startX;
    let scrollLeft;

    elements.solutionsCarousel.addEventListener('mousedown', (e) => {
        isDown = true;
        elements.solutionsCarousel.style.cursor = 'grabbing';
        startX = e.pageX - elements.solutionsCarousel.offsetLeft;
        scrollLeft = elements.solutionsCarousel.scrollLeft;
    });

    elements.solutionsCarousel.addEventListener('mouseleave', () => {
        isDown = false;
        elements.solutionsCarousel.style.cursor = 'grab';
    });

    elements.solutionsCarousel.addEventListener('mouseup', () => {
        isDown = false;
        elements.solutionsCarousel.style.cursor = 'grab';
    });

    elements.solutionsCarousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - elements.solutionsCarousel.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast modifier
        elements.solutionsCarousel.scrollLeft = scrollLeft - walk;
    });
}

// Blur search input when interacting with canvas (K-map/Simulation) to allow syncLoop updates
if (elements.canvas) {
    ['mousedown', 'touchstart'].forEach(evt => {
        elements.canvas.addEventListener(evt, () => {
            if (document.activeElement === elements.input) {
                elements.input.blur();
            }
        }, true);
    });
}
let lastKMapData = null;

