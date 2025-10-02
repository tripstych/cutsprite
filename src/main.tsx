import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import $ from 'jquery'
import JSZip from 'jszip'
import type { Anchor, Groups, Slices } from './types'
import { ANCHOR_PRESETS } from './types'

let groups: Groups[] = [{
  name: "Group 1",
  color: "#ff6b6b",
  default_anchor: ANCHOR_PRESETS.CENTER,
  slices: []
}]
let currentGroup = groups[0];

// Custom Modal Functions
function showModal(title: string, message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay') as HTMLElement;
    const titleElement = document.getElementById('modal-title') as HTMLElement;
    const messageElement = document.getElementById('modal-message') as HTMLElement;
    const input = document.getElementById('modal-input') as HTMLInputElement;
    const okBtn = document.getElementById('modal-ok') as HTMLButtonElement;
    const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
    const closeBtn = document.getElementById('modal-close') as HTMLButtonElement;

    // Check if all elements exist
    if (!overlay || !titleElement || !messageElement || !input || !okBtn || !cancelBtn || !closeBtn) {
      console.error('Modal elements not found. Make sure the modal HTML is rendered.');
      resolve(null);
      return;
    }

    // Set modal content
    titleElement.textContent = title;
    messageElement.textContent = message;
    input.value = defaultValue;
    
    // Show modal
    overlay.style.display = 'flex';
    
    // Focus input and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);

    // Handle OK button
    const handleOk = () => {
      const value = input.value.trim();
      hideModal();
      resolve(value || null);
    };

    // Handle Cancel/Close
    const handleCancel = () => {
      hideModal();
      resolve(null);
    };

    // Handle Enter key
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    // Add event listeners
    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;
    overlay.onclick = (e) => {
      if (e.target === overlay) handleCancel();
    };
    input.onkeydown = handleKeyPress;
  });
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay') as HTMLElement;
  if (!overlay) return;
  
  overlay.style.display = 'none';
  
  // Clean up event listeners
  const okBtn = document.getElementById('modal-ok') as HTMLButtonElement;
  const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
  const closeBtn = document.getElementById('modal-close') as HTMLButtonElement;
  const input = document.getElementById('modal-input') as HTMLInputElement;
  
  if (okBtn) okBtn.onclick = null;
  if (cancelBtn) cancelBtn.onclick = null;
  if (closeBtn) closeBtn.onclick = null;
  if (input) input.onkeydown = null;
}

// Custom prompt replacement
async function customPrompt(message: string, defaultValue: string = ''): Promise<string | null> {
  return await showModal('Input Required', message, defaultValue);
}

class SliceTool {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private slices: Slices[] = []
  private isDrawing = false
  private isDragging = false
  private draggedRect: Slices | null = null
  private startX = 0
  private startY = 0
  private dragOffsetX = 0
  private dragOffsetY = 0
  private nextId = 1
  private snapThreshold = 10 // pixels
  private snapLines: { x: number[], y: number[] } = { x: [], y: [] }
  private backgroundImage: HTMLImageElement | null = null
  private imageScale = 1
  private imageOffsetX = 0
  private imageOffsetY = 0
  private currentFrame = 0
  private isPlaying = false
  private animationInterval: number | null = null
  public fps = 12
  private isInAnimationMode = false // Track if we're in any animation mode
  private isResizing = false
  private resizeHandle: string | null = null // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  private resizeStartRect: { x: number, y: number, width: number, height: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.setupEventListeners()
    this.draw()
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this))
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this))
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this))
    this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this))
    
    // Keyboard controls - need to add to document for global access
    document.addEventListener('keydown', this.handleKeyDown.bind(this))
    
    // Make canvas focusable for keyboard events
    this.canvas.tabIndex = 0
  }

  private getMousePos(e: MouseEvent): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  private isPointInRect(x: number, y: number, rect: Slices): boolean {
    return x >= rect.x && x <= rect.x + rect.width &&
           y >= rect.y && y <= rect.y + rect.height
  }

  private getResizeHandle(x: number, y: number, rect: Slices): string | null {
    if (!rect.selected) return null
    
    const tolerance = 4
    
    // Corner handles
    if (Math.abs(x - rect.x) <= tolerance && Math.abs(y - rect.y) <= tolerance) {
      return 'nw' // northwest
    }
    if (Math.abs(x - (rect.x + rect.width)) <= tolerance && Math.abs(y - rect.y) <= tolerance) {
      return 'ne' // northeast
    }
    if (Math.abs(x - rect.x) <= tolerance && Math.abs(y - (rect.y + rect.height)) <= tolerance) {
      return 'sw' // southwest
    }
    if (Math.abs(x - (rect.x + rect.width)) <= tolerance && Math.abs(y - (rect.y + rect.height)) <= tolerance) {
      return 'se' // southeast
    }
    
    // Edge handles
    if (Math.abs(y - rect.y) <= tolerance && x >= rect.x - tolerance && x <= rect.x + rect.width + tolerance) {
      return 'n' // north
    }
    if (Math.abs(y - (rect.y + rect.height)) <= tolerance && x >= rect.x - tolerance && x <= rect.x + rect.width + tolerance) {
      return 's' // south
    }
    if (Math.abs(x - rect.x) <= tolerance && y >= rect.y - tolerance && y <= rect.y + rect.height + tolerance) {
      return 'w' // west
    }
    if (Math.abs(x - (rect.x + rect.width)) <= tolerance && y >= rect.y - tolerance && y <= rect.y + rect.height + tolerance) {
      return 'e' // east
    }
    
    return null
  }

  private getCursorForHandle(handle: string | null): string {
    if (!handle) return 'default'
    
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nw-resize'
      case 'ne':
      case 'sw':
        return 'ne-resize'
      case 'n':
      case 's':
        return 'ns-resize'
      case 'e':
      case 'w':
        return 'ew-resize'
      default:
        return 'default'
    }
  }

  private findRectAtPoint(x: number, y: number): Slices | null {
    // Search from top to bottom (last drawn first)
    for (let i = this.slices.length - 1; i >= 0; i--) {
      if (this.isPointInRect(x, y, this.slices[i])) {
        return this.slices[i]
      }
    }
    return null
  }

  private calculateSnapLines(excludeRect: Slices): { x: number[], y: number[] } {
    const snapLines = { x: [] as number[], y: [] as number[] }
    
    this.slices.forEach(rect => {
      if (rect.id !== excludeRect.id) {
        // Vertical snap lines (x coordinates)
        snapLines.x.push(rect.x) // left edge
        snapLines.x.push(rect.x + rect.width) // right edge
        
        // Horizontal snap lines (y coordinates)
        snapLines.y.push(rect.y) // top edge
        snapLines.y.push(rect.y + rect.height) // bottom edge
      }
    })
    
    // Add canvas edges
    snapLines.x.push(0, this.canvas.width)
    snapLines.y.push(0, this.canvas.height)
    
    return snapLines
  }

  private snapToGrid(rect: Slices, snapLines: { x: number[], y: number[] }): { x: number, y: number } {
    let snappedX = rect.x
    let snappedY = rect.y
    
    // Find closest snap line for left edge
    let minXDist = this.snapThreshold + 1
    snapLines.x.forEach(snapX => {
      const dist = Math.abs(rect.x - snapX)
      if (dist < minXDist && dist <= this.snapThreshold) {
        minXDist = dist
        snappedX = snapX
      }
    })
    
    // Find closest snap line for right edge
    snapLines.x.forEach(snapX => {
      const dist = Math.abs((rect.x + rect.width) - snapX)
      if (dist < minXDist && dist <= this.snapThreshold) {
        minXDist = dist
        snappedX = snapX - rect.width
      }
    })
    
    // Find closest snap line for top edge
    let minYDist = this.snapThreshold + 1
    snapLines.y.forEach(snapY => {
      const dist = Math.abs(rect.y - snapY)
      if (dist < minYDist && dist <= this.snapThreshold) {
        minYDist = dist
        snappedY = snapY
      }
    })
    
    // Find closest snap line for bottom edge
    snapLines.y.forEach(snapY => {
      const dist = Math.abs((rect.y + rect.height) - snapY)
      if (dist < minYDist && dist <= this.snapThreshold) {
        minYDist = dist
        snappedY = snapY - rect.height
      }
    })
    
    return { x: snappedX, y: snappedY }
  }

  private updateSnapLines(draggedRect: Slices) {
    this.snapLines = this.calculateSnapLines(draggedRect)
  }

  private snapRectangleForResize(rect: { x: number, y: number, width: number, height: number }, handle: string, snapLines: { x: number[], y: number[] }): { x: number, y: number, width: number, height: number } {
    let snappedRect = { ...rect }
    
    // Snap based on which handle is being used
    switch (handle) {
      case 'nw': // Northwest - snap left and top edges
        snappedRect.x = this.snapCoordinate(rect.x, snapLines.x)
        snappedRect.y = this.snapCoordinate(rect.y, snapLines.y)
        snappedRect.width = rect.x + rect.width - snappedRect.x
        snappedRect.height = rect.y + rect.height - snappedRect.y
        break
        
      case 'ne': // Northeast - snap right and top edges
        snappedRect.y = this.snapCoordinate(rect.y, snapLines.y)
        const snappedRight = this.snapCoordinate(rect.x + rect.width, snapLines.x)
        snappedRect.width = snappedRight - rect.x
        snappedRect.height = rect.y + rect.height - snappedRect.y
        break
        
      case 'sw': // Southwest - snap left and bottom edges
        snappedRect.x = this.snapCoordinate(rect.x, snapLines.x)
        const snappedBottom = this.snapCoordinate(rect.y + rect.height, snapLines.y)
        snappedRect.width = rect.x + rect.width - snappedRect.x
        snappedRect.height = snappedBottom - rect.y
        break
        
      case 'se': // Southeast - snap right and bottom edges
        const snappedRightSE = this.snapCoordinate(rect.x + rect.width, snapLines.x)
        const snappedBottomSE = this.snapCoordinate(rect.y + rect.height, snapLines.y)
        snappedRect.width = snappedRightSE - rect.x
        snappedRect.height = snappedBottomSE - rect.y
        break
        
      case 'n': // North - snap top edge only
        snappedRect.y = this.snapCoordinate(rect.y, snapLines.y)
        snappedRect.height = rect.y + rect.height - snappedRect.y
        break
        
      case 's': // South - snap bottom edge only
        const snappedBottomS = this.snapCoordinate(rect.y + rect.height, snapLines.y)
        snappedRect.height = snappedBottomS - rect.y
        break
        
      case 'w': // West - snap left edge only
        snappedRect.x = this.snapCoordinate(rect.x, snapLines.x)
        snappedRect.width = rect.x + rect.width - snappedRect.x
        break
        
      case 'e': // East - snap right edge only
        const snappedRightE = this.snapCoordinate(rect.x + rect.width, snapLines.x)
        snappedRect.width = snappedRightE - rect.x
        break
    }
    
    // Ensure minimum size
    if (snappedRect.width < 5) {
      if (handle.includes('w')) {
        snappedRect.x = snappedRect.x + snappedRect.width - 5
      }
      snappedRect.width = 5
    }
    if (snappedRect.height < 5) {
      if (handle.includes('n')) {
        snappedRect.y = snappedRect.y + snappedRect.height - 5
      }
      snappedRect.height = 5
    }
    
    return snappedRect
  }
  
  private snapCoordinate(coordinate: number, snapLines: number[]): number {
    let closestSnap = coordinate
    let minDistance = this.snapThreshold + 1
    
    snapLines.forEach(snapLine => {
      const distance = Math.abs(coordinate - snapLine)
      if (distance < minDistance && distance <= this.snapThreshold) {
        minDistance = distance
        closestSnap = snapLine
      }
    })
    
    return closestSnap
  }

  private handleMouseDown(e: MouseEvent) {
    const pos = this.getMousePos(e)
    const clickedRect = this.findRectAtPoint(pos.x, pos.y)

    if (clickedRect) {
      // Check if clicking on a resize handle
      const handle = this.getResizeHandle(pos.x, pos.y, clickedRect)
      
      if (handle) {
        // Start resizing
        this.isResizing = true
        this.resizeHandle = handle
        this.draggedRect = clickedRect
        this.resizeStartRect = {
          x: clickedRect.x,
          y: clickedRect.y,
          width: clickedRect.width,
          height: clickedRect.height
        }
        this.startX = pos.x
        this.startY = pos.y
        
        // Calculate snap lines for resize operation
        this.updateSnapLines(clickedRect)
      } else {
        // Start dragging existing rectangle
        this.isDragging = true
        this.draggedRect = clickedRect
        this.dragOffsetX = pos.x - clickedRect.x
        this.dragOffsetY = pos.y - clickedRect.y
        
        // Calculate snap lines for this drag operation
        this.updateSnapLines(clickedRect)
      }
      
      // Select the clicked rectangle
      this.slices.forEach(rect => rect.selected = false)
      clickedRect.selected = true
    } else {
      // Start creating new rectangle
      this.isDrawing = true
      this.startX = pos.x
      this.startY = pos.y
      
      // Deselect all rectangles
      this.slices.forEach(rect => rect.selected = false)
    }
    
    this.draw()
  }

  private handleMouseMove(e: MouseEvent) {
    const pos = this.getMousePos(e)

    if (this.isResizing && this.draggedRect && this.resizeHandle && this.resizeStartRect) {
      // Handle resizing
      const deltaX = pos.x - this.startX
      const deltaY = pos.y - this.startY
      
      let newRect = { ...this.resizeStartRect }
      
      // Apply resize based on handle
      switch (this.resizeHandle) {
        case 'nw':
          newRect.x += deltaX
          newRect.y += deltaY
          newRect.width -= deltaX
          newRect.height -= deltaY
          break
        case 'ne':
          newRect.y += deltaY
          newRect.width += deltaX
          newRect.height -= deltaY
          break
        case 'sw':
          newRect.x += deltaX
          newRect.width -= deltaX
          newRect.height += deltaY
          break
        case 'se':
          newRect.width += deltaX
          newRect.height += deltaY
          break
        case 'n':
          newRect.y += deltaY
          newRect.height -= deltaY
          break
        case 's':
          newRect.height += deltaY
          break
        case 'w':
          newRect.x += deltaX
          newRect.width -= deltaX
          break
        case 'e':
          newRect.width += deltaX
          break
      }
      
      // Ensure minimum size
      if (newRect.width < 5) {
        if (this.resizeHandle.includes('w')) {
          newRect.x = this.resizeStartRect.x + this.resizeStartRect.width - 5
        }
        newRect.width = 5
      }
      if (newRect.height < 5) {
        if (this.resizeHandle.includes('n')) {
          newRect.y = this.resizeStartRect.y + this.resizeStartRect.height - 5
        }
        newRect.height = 5
      }
      
      // Apply snapping with specialized resize snapping
      const snappedRect = this.snapRectangleForResize(newRect, this.resizeHandle, this.snapLines)
      
      // Update the dragged rectangle
      this.draggedRect.x = snappedRect.x
      this.draggedRect.y = snappedRect.y
      this.draggedRect.width = snappedRect.width
      this.draggedRect.height = snappedRect.height
      
      this.draw()
    } else if (this.isDragging && this.draggedRect) {
      // Update dragged rectangle position with snapping
      const newX = pos.x - this.dragOffsetX
      const newY = pos.y - this.dragOffsetY
      
      // Create temporary rectangle for snapping calculation
      const tempRect = { ...this.draggedRect, x: newX, y: newY }
      const snapped = this.snapToGrid(tempRect, this.snapLines)
      
      this.draggedRect.x = snapped.x
      this.draggedRect.y = snapped.y
      this.draw()
    } else if (this.isDrawing) {
      // Update preview rectangle while drawing
      this.draw()
      
      // Draw preview rectangle
      const width = pos.x - this.startX
      const height = pos.y - this.startY
      const x = width < 0 ? pos.x : this.startX
      const y = height < 0 ? pos.y : this.startY
      
      this.ctx.strokeStyle = '#ff0000'
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([5, 5])
      this.ctx.strokeRect(x, y, Math.abs(width), Math.abs(height))
      this.ctx.setLineDash([])
    } else {
      // Change cursor based on hover state
      const hoveredRect = this.findRectAtPoint(pos.x, pos.y)
      if (hoveredRect) {
        const handle = this.getResizeHandle(pos.x, pos.y, hoveredRect)
        this.canvas.style.cursor = handle ? this.getCursorForHandle(handle) : 'move'
      } else {
        this.canvas.style.cursor = 'crosshair'
      }
    }
  }

  private handleMouseUp(e: MouseEvent) {
    if (this.isDrawing) {
      const pos = this.getMousePos(e)
      const width = pos.x - this.startX
      const height = pos.y - this.startY
      
      // Only create rectangle if it has minimum size
      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        const newRect: Slices = {
          id: this.nextId++,
          x: width < 0 ? pos.x : this.startX,
          y: height < 0 ? pos.y : this.startY,
          width: Math.abs(width),
          height: Math.abs(height),
          color: currentGroup.color,
          selected: true,
          anchor: currentGroup.default_anchor,
          group: currentGroup
        }
        currentGroup.slices.push(newRect)
        this.slices.push(newRect)
      }
      
      this.isDrawing = false
    }
    
    if (this.isDragging) {
      this.isDragging = false
      this.draggedRect = null
    }
    
    if (this.isResizing) {
      this.isResizing = false
      this.resizeHandle = null
      this.resizeStartRect = null
      this.draggedRect = null
    }
    
    this.draw()
  }

  private handleRightClick(e: MouseEvent) {
    e.preventDefault()
    const pos = this.getMousePos(e)
    const clickedRect = this.findRectAtPoint(pos.x, pos.y)
    
    if (clickedRect) {
      // Select the right-clicked slice
      this.slices.forEach(rect => rect.selected = false)
      clickedRect.selected = true
      this.draw()
      this.updateSliceImages()
      
      // Show context menu at mouse position
      this.showContextMenu(e.clientX, e.clientY, clickedRect.id)
    } else {
      // Hide context menu if clicking on empty area
      this.hideContextMenu()
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Only handle arrow keys and only if we have selected slices
    const selectedSlices = this.slices.filter(slice => slice.selected)
    if (selectedSlices.length === 0) return

    // Check if focus is on an input field - if so, don't handle keys
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return
    }

    const nudgeAmount = 1
    let handled = false

    selectedSlices.forEach(slice => {
      if (e.altKey || e.ctrlKey) {
        // Alt/Ctrl + Arrow Keys: Resize slice
        let dx = 0, dy = 0, dw = 0, dh = 0
        
        // Determine direction based on key
        switch (e.key) {
          case 'ArrowUp':
            dy = -1; dh = 1
            handled = true
            break
          case 'ArrowDown':
            dy = 0; dh = 1
            handled = true
            break
          case 'ArrowLeft':
            dx = -1; dw = 1
            handled = true
            break
          case 'ArrowRight':
            dx = 0; dw = 1
            handled = true
            break
        }
        
        // Apply alt/ctrl logic to flip directions if needed
        if (e.ctrlKey) {
          dx = -dx; dy = -dy; dw = -dw; dh = -dh
        }
        
        // Apply the changes
        if (handled) {
          slice.x += dx * nudgeAmount
          slice.y += dy * nudgeAmount
          slice.width = Math.max(1, slice.width + dw * nudgeAmount)
          slice.height = Math.max(1, slice.height + dh * nudgeAmount)
        }
      } else {
        // Arrow Keys: Nudge slice position
        switch (e.key) {
          case 'ArrowUp':
            slice.y = Math.max(0, slice.y - nudgeAmount)
            handled = true
            break
          case 'ArrowDown':
            slice.y = Math.min(this.canvas.height - slice.height, slice.y + nudgeAmount)
            handled = true
            break
          case 'ArrowLeft':
            slice.x = Math.max(0, slice.x - nudgeAmount)
            handled = true
            break
          case 'ArrowRight':
            slice.x = Math.min(this.canvas.width - slice.width, slice.x + nudgeAmount)
            handled = true
            break
        }
      }
    })

    if (handled) {
      e.preventDefault()
      this.draw()
      this.updateSliceImages()
    }
  }

  public draw() {
    // Clear canvas
    this.ctx.fillStyle = 'lightgray'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    
    // Draw background image if loaded
    if (this.backgroundImage) {
      this.ctx.save()
      this.ctx.globalAlpha = 1
      
      const scaledWidth = this.backgroundImage.width * this.imageScale
      const scaledHeight = this.backgroundImage.height * this.imageScale
      
      this.ctx.drawImage(
        this.backgroundImage,
        this.imageOffsetX,
        this.imageOffsetY,
        scaledWidth,
        scaledHeight
      )
      
      this.ctx.restore()
    }
    
    // Draw snap lines if dragging
    if (this.isDragging && this.draggedRect) {
      this.drawSnapLines()
    }
    
    // Draw all rectangles
    this.slices.forEach(rect => {
      // Fill rectangle with transparency if image is loaded
      this.ctx.fillStyle = rect.color
      if (this.backgroundImage) {
        this.ctx.globalAlpha = 0.3
      } else {
        this.ctx.globalAlpha = 1
      }
      this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      
      // Draw border
      this.ctx.globalAlpha = 1
      this.ctx.strokeStyle = rect.selected ? '#000000' : '#333333'
      this.ctx.lineWidth = rect.selected ? 3 : 1
      this.ctx.setLineDash([])
      this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
      
      // Draw selection handles for selected rectangle
      if (rect.selected) {
        this.drawSelectionHandles(rect)
        this.drawAnchorPoint(rect)
      }
    })
    
    // Update slice images only when not in fast animation mode
    if (!this.isPlaying || this.fps <= 12) {
      this.updateSliceImages()
    }
    
    // Update anchor controls based on selection
    this.updateAnchorControls()
  }

  private drawSnapLines() {
    if (!this.draggedRect) return
    
    this.ctx.strokeStyle = '#ff0066'
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([3, 3])
    this.ctx.globalAlpha = 0.7
    
    // Draw vertical snap lines that are close to the dragged rectangle
    this.snapLines.x.forEach(snapX => {
      const leftDist = Math.abs(this.draggedRect!.x - snapX)
      const rightDist = Math.abs((this.draggedRect!.x + this.draggedRect!.width) - snapX)
      
      if (leftDist <= this.snapThreshold || rightDist <= this.snapThreshold) {
        this.ctx.beginPath()
        this.ctx.moveTo(snapX, 0)
        this.ctx.lineTo(snapX, this.canvas.height)
        this.ctx.stroke()
      }
    })
    
    // Draw horizontal snap lines that are close to the dragged rectangle
    this.snapLines.y.forEach(snapY => {
      const topDist = Math.abs(this.draggedRect!.y - snapY)
      const bottomDist = Math.abs((this.draggedRect!.y + this.draggedRect!.height) - snapY)
      
      if (topDist <= this.snapThreshold || bottomDist <= this.snapThreshold) {
        this.ctx.beginPath()
        this.ctx.moveTo(0, snapY)
        this.ctx.lineTo(this.canvas.width, snapY)
        this.ctx.stroke()
      }
    })
    
    this.ctx.globalAlpha = 1
    this.ctx.setLineDash([])
  }

  private drawSelectionHandles(rect: Slices) {
    const handleSize = 8
    
    // Corner handles
    const cornerHandles = [
      { x: rect.x - handleSize/2, y: rect.y - handleSize/2 }, // nw
      { x: rect.x + rect.width - handleSize/2, y: rect.y - handleSize/2 }, // ne
      { x: rect.x - handleSize/2, y: rect.y + rect.height - handleSize/2 }, // sw
      { x: rect.x + rect.width - handleSize/2, y: rect.y + rect.height - handleSize/2 } // se
    ]
    
    // Edge handles
    const edgeHandles = [
      { x: rect.x + rect.width/2 - handleSize/2, y: rect.y - handleSize/2 }, // n
      { x: rect.x + rect.width/2 - handleSize/2, y: rect.y + rect.height - handleSize/2 }, // s
      { x: rect.x - handleSize/2, y: rect.y + rect.height/2 - handleSize/2 }, // w
      { x: rect.x + rect.width - handleSize/2, y: rect.y + rect.height/2 - handleSize/2 } // e
    ]
    
    // Draw corner handles (larger, more prominent)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.strokeStyle = '#0066cc'
    this.ctx.lineWidth = 2
    
    cornerHandles.forEach(handle => {
      this.ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
      this.ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
    })
    
    // Draw edge handles (smaller)
    this.ctx.fillStyle = '#e6f3ff'
    this.ctx.strokeStyle = '#0066cc'
    this.ctx.lineWidth = 1
    const edgeSize = 6
    
    edgeHandles.forEach(handle => {
      const adjustedX = handle.x + (handleSize - edgeSize) / 2
      const adjustedY = handle.y + (handleSize - edgeSize) / 2
      this.ctx.fillRect(adjustedX, adjustedY, edgeSize, edgeSize)
      this.ctx.strokeRect(adjustedX, adjustedY, edgeSize, edgeSize)
    })
  }

  private drawAnchorPoint(rect: Slices) {
    const effectiveAnchor = this.getEffectiveSliceAnchor(rect)
    
    // Calculate anchor position within the slice
    const anchorX = rect.x + (rect.width * effectiveAnchor.x)
    const anchorY = rect.y + (rect.height * effectiveAnchor.y)
    
    // Draw anchor cross
    this.ctx.strokeStyle = rect.anchor ? '#ff6600' : '#ffaa00' // Orange for custom, yellow for inherited
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([])
    
    const crossSize = 8
    
    // Draw crosshair
    this.ctx.beginPath()
    this.ctx.moveTo(anchorX - crossSize, anchorY)
    this.ctx.lineTo(anchorX + crossSize, anchorY)
    this.ctx.moveTo(anchorX, anchorY - crossSize)
    this.ctx.lineTo(anchorX, anchorY + crossSize)
    this.ctx.stroke()
    
    // Draw center circle
    this.ctx.fillStyle = rect.anchor ? '#ff6600' : '#ffaa00'
    this.ctx.beginPath()
    this.ctx.arc(anchorX, anchorY, 3, 0, 2 * Math.PI)
    this.ctx.fill()
    
    // Draw border around center circle
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1
    this.ctx.beginPath()
    this.ctx.arc(anchorX, anchorY, 3, 0, 2 * Math.PI)
    this.ctx.stroke()
  }

  public deleteSelected() {
    const selectedSlices = this.slices.filter(slice => slice.selected)
    selectedSlices.forEach(slice => {
      if (slice.group) {
        slice.group.slices = slice.group.slices.filter(s => s.id !== slice.id)
      }
    })
    this.slices = this.slices.filter(rect => !rect.selected)
    this.draw()
    this.updateSliceImages()
  }

  public deleteSlice(sliceId: number) {
    const slice = this.slices.find(s => s.id === sliceId)
    if (slice && slice.group) {
      slice.group.slices = slice.group.slices.filter(s => s.id !== sliceId)
      this.slices = this.slices.filter(s => s.id !== sliceId)
      this.updateGroupsList()
      this.updateSliceImages()
      this.draw()
    }
  }

  public duplicateSlice(sliceId: number) {
    const originalSlice = this.slices.find(s => s.id === sliceId)
    if (originalSlice && originalSlice.group) {
      // Deselect all slices first
      this.slices.forEach(s => s.selected = false)
      
      // Create duplicate with slight offset
      const duplicateSlice: Slices = {
        id: this.nextId++,
        x: originalSlice.x + 10,
        y: originalSlice.y + 10,
        width: originalSlice.width,
        height: originalSlice.height,
        color: originalSlice.color,
        selected: true,
        group: originalSlice.group
      }
      
      originalSlice.group.slices.push(duplicateSlice)
      this.slices.push(duplicateSlice)
      
      this.updateGroupsList()
      this.updateSliceImages()
      this.draw()
    }
  }

  public clearAll() {
    this.slices = []
    groups.forEach(group => group.slices = [])
    this.draw()
    this.updateSliceImages()
  }

  // Group Management Functions
  public createGroup(name: string, color: string, defaultAnchor: Anchor = ANCHOR_PRESETS.CENTER): Groups {
    const newGroup: Groups = {
      name,
      color,
      default_anchor: defaultAnchor,
      slices: []
    }
    groups.push(newGroup)
    this.updateGroupsList()
    return newGroup
  }

  public deleteGroup(group: Groups) {
    if (groups.length <= 1) {
      alert("Cannot delete the last group!")
      return
    }
    
    // Remove slices from this group
    group.slices.forEach(slice => {
      slice.group = null
      this.slices = this.slices.filter(s => s.id !== slice.id)
    })
    
    // Remove group from groups array
    const index = groups.indexOf(group)
    if (index > -1) {
      groups.splice(index, 1)
    }
    
    // Set current group to first available group
    if (currentGroup === group) {
      currentGroup = groups[0]
    }
    
    this.updateGroupsList()
    this.draw()
  }

  public renameGroup(group: Groups, newName: string) {
    group.name = newName
    this.updateGroupsList()
  }

  public changeGroupColor(group: Groups, newColor: string) {
    group.color = newColor
    // Update all slices in this group to use the new color
    group.slices.forEach(slice => {
      slice.color = newColor
    })
    this.updateGroupsList()
    this.draw()
  }

  public setCurrentGroup(group: Groups) {
    currentGroup = group
    this.stopAnimation()
    this.isInAnimationMode = false // Reset animation mode
    this.currentFrame = 0
    this.updateGroupsList()
    this.updateCurrentGroupDisplay()
    this.updateSliceImages()
    this.updateFrameCounter()
    this.updateGroupAnchorVisual(group.default_anchor)
  }

  public updateCurrentGroupDisplay() {
    const currentGroupName = $('#current-group-name')
    if (currentGroupName.length > 0) {
      currentGroupName.text(currentGroup.name)
      currentGroupName.css('color', currentGroup.color)
    }
    this.updateAnchorControls()
  }

  // Anchor Management Methods
  public setGroupDefaultAnchor(group: Groups, anchor: Anchor) {
    group.default_anchor = anchor
    this.updateGroupsList()
    this.updateAnchorControls()
  }

  public setSliceAnchor(slice: Slices, anchor: Anchor | undefined) {
    slice.anchor = anchor
    this.updateAnchorControls()
  }

  public getEffectiveSliceAnchor(slice: Slices): Anchor {
    return slice.anchor || (slice.group ? slice.group.default_anchor : ANCHOR_PRESETS.CENTER)
  }

  private updateAnchorControls() {
    // Update anchor controls visibility based on selection
    const selectedSlices = this.slices.filter(s => s.selected)
    const sliceAnchorControls = $('.slice-anchor-controls')
    
    if (selectedSlices.length === 1) {
      sliceAnchorControls.addClass('visible')
      this.updateSliceAnchorDisplay(selectedSlices[0])
    } else {
      sliceAnchorControls.removeClass('visible')
    }
  }

  private updateSliceAnchorDisplay(slice: Slices) {
    const hasCustomAnchor = slice.anchor !== undefined
    const effectiveAnchor = this.getEffectiveSliceAnchor(slice)
    
    // Update the checkbox state
    $('#slice-anchor-inherit').prop('checked', !hasCustomAnchor)
    
    // Update anchor display
    if (hasCustomAnchor) {
      // Show slice's custom anchor
      this.displayAnchorInUI('slice-anchor-control', slice.anchor!)
    } else {
      // Show inherited anchor from group
      this.displayAnchorInUI('slice-anchor-control', effectiveAnchor, true)
    }
    
    // Update position and size info
    this.updateSliceAnchorInfo(slice, effectiveAnchor)
  }

  public updateSliceAnchorInfo(slice: Slices, anchor: Anchor) {
    // Calculate actual pixel position of the anchor within the slice
    const anchorPixelX = Math.round(slice.width * anchor.x)
    const anchorPixelY = Math.round(slice.height * anchor.y)
    
    // Update the info display
    $('#slice-anchor-position').text(`${anchorPixelX}, ${anchorPixelY}`)
    $('#slice-size-info').text(`${slice.width} × ${slice.height}`)
  }

  private displayAnchorInUI(containerId: string, anchor: Anchor, isInherited: boolean = false) {
    const container = $(`#${containerId}`)
    if (container.length === 0) return
    
    // Update the visual anchor control (this would integrate with React component)
    // For now, just update some basic display elements
    container.find('.anchor-x-input').val(anchor.x.toFixed(2))
    container.find('.anchor-y-input').val(anchor.y.toFixed(2))
    
    if (isInherited) {
      container.addClass('inherited')
    } else {
      container.removeClass('inherited')
    }
  }

  public getSelectedSlices(): Slices[] {
    return this.slices.filter(s => s.selected)
  }

  public updateGroupAnchorVisual(anchor: Anchor) {
    const indicator = $('#group-anchor-indicator')
    if (indicator.length > 0) {
      indicator.css({
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`
      })
    }
    
    // Update input fields
    $('#group-anchor-x').val(anchor.x.toFixed(2))
    $('#group-anchor-y').val(anchor.y.toFixed(2))
    
    // Update preset selection
    const presetKey = this.findAnchorPreset(anchor)
    $('#group-anchor-preset').val(presetKey || '')
  }

  public updateSliceAnchorVisual(anchor: Anchor) {
    const indicator = $('#slice-anchor-indicator')
    if (indicator.length > 0) {
      indicator.css({
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`
      })
    }
    
    // Update input fields
    $('#slice-anchor-x').val(anchor.x.toFixed(2))
    $('#slice-anchor-y').val(anchor.y.toFixed(2))
    
    // Update preset selection
    const presetKey = this.findAnchorPreset(anchor)
    $('#slice-anchor-preset').val(presetKey || '')
  }

  private findAnchorPreset(anchor: Anchor): string | null {
    for (const [key, preset] of Object.entries(ANCHOR_PRESETS)) {
      if (Math.abs(preset.x - anchor.x) < 0.001 && Math.abs(preset.y - anchor.y) < 0.001) {
        return key
      }
    }
    return null
  }

  public initializeAnchorControls() {
    // Initialize group anchor controls with current group's default anchor
    this.updateGroupAnchorVisual(currentGroup.default_anchor)
    
    // Initialize slice anchor controls (hidden by default)
    $('.slice-anchor-controls').removeClass('visible')
  }

  public moveSliceToGroup(slice: Slices, targetGroup: Groups) {
    // Remove from current group
    if (slice.group) {
      slice.group.slices = slice.group.slices.filter(s => s.id !== slice.id)
    }
    
    // Add to target group
    slice.group = targetGroup
    slice.color = targetGroup.color
    targetGroup.slices.push(slice)
    
    this.updateGroupsList()
    this.draw()
  }

  public selectGroup(group: Groups) {
    // Deselect all slices first
    this.slices.forEach(slice => slice.selected = false)
    
    // Select all slices in the group
    group.slices.forEach(slice => slice.selected = true)
    
    this.draw()
  }

  public duplicateGroup(group: Groups): Groups {
    const newGroup = this.createGroup(`${group.name} Copy`, group.color, group.default_anchor)
    
    // Duplicate all slices in the group
    group.slices.forEach(slice => {
      const newSlice: Slices = {
        id: this.nextId++,
        x: slice.x + 20, // Offset slightly
        y: slice.y + 20,
        width: slice.width,
        height: slice.height,
        color: slice.color,
        selected: false,
        group: newGroup
      }
      
      newGroup.slices.push(newSlice)
      this.slices.push(newSlice)
    })
    
    this.updateGroupsList()
    this.draw()
    return newGroup
  }

  public updateGroupsList() {
    const groupsContainer = $('#groups-list')
    if (groupsContainer.length === 0) return
    
    groupsContainer.empty()
    
    groups.forEach((group, index) => {
      const isActive = group === currentGroup
      const groupElement = $(`
        <div class="group-item ${isActive ? 'active' : ''}" data-group-index="${index}">
          <div class="group-header">
            <div class="group-color" style="background-color: ${group.color}"></div>
            <span class="group-name">${group.name}</span>
            <span class="group-count">(${group.slices.length})</span>
            <div class="group-actions">
              <button class="btn-select" title="Select all slices in group">👁</button>
              <button class="btn-rename" title="Rename group">✏️</button>
              <button class="btn-color" title="Change color">🎨</button>
              <button class="btn-duplicate" title="Duplicate group">📋</button>
              <button class="btn-delete" title="Delete group">🗑️</button>
              <button class="export-single-image" title="Export slices as images">📤</button>
              <button class="export-all-images" title="Export all slices as a ZIP">🗜️</button>
            </div>
          </div>
          <div class="group-details">
            <div class="group-anchor">Anchor: ${group.default_anchor.x.toFixed(2)}, ${group.default_anchor.y.toFixed(2)}</div>
          </div>
        </div>
      `)
      
      groupsContainer.append(groupElement)
    })
    
    this.setupGroupEventListeners()
  }

  private setupGroupEventListeners() {
    // Group selection
    $('.group-item').off('click').on('click', (e) => {
      if ($(e.target).hasClass('group-item') || $(e.target).hasClass('group-name')) {
        const index = parseInt($(e.currentTarget).data('group-index'))
        this.setCurrentGroup(groups[index])
      }
    })
    
    // Select all slices in group
    $('.btn-select').off('click').on('click', (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      this.selectGroup(groups[index])
    })
    
    // Rename group
    $('.btn-rename').off('click').on('click', async (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      const group = groups[index]
      const newName = await customPrompt('Enter new group name:', group.name)
      if (newName && newName.trim()) {
        this.renameGroup(group, newName.trim())
      }
    })
    
    // Change group color
    $('.btn-color').off('click').on('click', (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      const group = groups[index]
      const colorInput = $('<input type="color" style="display:none;">')
      colorInput.val(group.color)
      $('body').append(colorInput)
      colorInput.trigger('click')
      colorInput.on('change', () => {
        this.changeGroupColor(group, colorInput.val() as string)
        colorInput.remove()
      })
      setTimeout(() => colorInput.remove(), 5000) // Cleanup
    })
    
    // Duplicate group
    $('.btn-duplicate').off('click').on('click', (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      this.duplicateGroup(groups[index])
    })
    
    // Delete group
    $('.btn-delete').off('click').on('click', (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      const group = groups[index]
      if (confirm(`Delete group "${group.name}" and all its slices?`)) {
        this.deleteGroup(group)
      }
    })
  }

  public exportGroupData(): string {
    const exportData = {
      groups: groups.map(group => ({
        name: group.name,
        color: group.color,
        default_anchor: group.default_anchor,
        slices: group.slices.map(slice => ({
          x: slice.x,
          y: slice.y,
          width: slice.width,
          height: slice.height,
          anchor: slice.anchor
        }))
      }))
    }
    return JSON.stringify(exportData, null, 2)
  }

  public importGroupData(jsonData: string) {
    try {
      const data = JSON.parse(jsonData)
      
      // Clear existing data
      this.clearAll()
      groups.length = 0
      
      // Import groups and slices
      data.groups.forEach((groupData: any) => {
        // Handle legacy string format for anchors
        let defaultAnchor = ANCHOR_PRESETS.CENTER
        if (groupData.default_anchor) {
          if (typeof groupData.default_anchor === 'string') {
            // Parse legacy "x, y" string format
            const parts = groupData.default_anchor.split(',').map((s: string) => parseFloat(s.trim()))
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              defaultAnchor = { x: parts[0], y: parts[1] }
            }
          } else {
            // Use new object format
            defaultAnchor = groupData.default_anchor
          }
        }
        
        const group = this.createGroup(groupData.name, groupData.color, defaultAnchor)
        
        groupData.slices.forEach((sliceData: any) => {
          // Handle individual slice anchors
          let sliceAnchor: Anchor | undefined = undefined
          if (sliceData.anchor) {
            if (typeof sliceData.anchor === 'string') {
              // Parse legacy "x, y" string format
              const parts = sliceData.anchor.split(',').map((s: string) => parseFloat(s.trim()))
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                sliceAnchor = { x: parts[0], y: parts[1] }
              }
            } else {
              sliceAnchor = sliceData.anchor
            }
          }
          
          const slice: Slices = {
            id: this.nextId++,
            x: sliceData.x,
            y: sliceData.y,
            width: sliceData.width,
            height: sliceData.height,
            color: group.color,
            selected: false,
            group: group,
            anchor: sliceAnchor
          }
          
          group.slices.push(slice)
          this.slices.push(slice)
        })
      })
      
      if (groups.length > 0) {
        currentGroup = groups[0]
      }
      
      this.updateGroupsList()
      this.draw()
      
    } catch (error) {
      alert('Invalid JSON data!')
    }
  }

  public saveProject(): string {
    const projectData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      groups: groups.map(group => ({
        name: group.name,
        color: group.color,
        default_anchor: group.default_anchor,
        slices: group.slices.map(slice => ({
          x: slice.x,
          y: slice.y,
          width: slice.width,
          height: slice.height,
          anchor: slice.anchor
        }))
      })),
      currentGroup: {
        name: currentGroup.name
      },
      backgroundImage: {
        scale: this.imageScale,
        offsetX: this.imageOffsetX,
        offsetY: this.imageOffsetY,
        hasImage: this.backgroundImage !== null,
        imageData: this.backgroundImage ? this.backgroundImage.src : null,
        width: this.backgroundImage ? this.backgroundImage.width : 0,
        height: this.backgroundImage ? this.backgroundImage.height : 0
      }
    }
    return JSON.stringify(projectData, null, 2)
  }

  public loadProject(jsonData: string) {
    try {
      const data = JSON.parse(jsonData)
      
      // Validate project data
      if (!data.version || !data.groups) {
        throw new Error('Invalid project file format')
      }
      
      // Clear existing data
      this.clearAll()
      groups.length = 0
      
      // Import groups and slices
      data.groups.forEach((groupData: any) => {
        // Handle legacy string format for anchors
        let defaultAnchor = ANCHOR_PRESETS.CENTER
        if (groupData.default_anchor) {
          if (typeof groupData.default_anchor === 'string') {
            // Parse legacy "x, y" string format
            const parts = groupData.default_anchor.split(',').map((s: string) => parseFloat(s.trim()))
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              defaultAnchor = { x: parts[0], y: parts[1] }
            }
          } else {
            // Use new object format
            defaultAnchor = groupData.default_anchor
          }
        }
        
        const group = this.createGroup(groupData.name, groupData.color, defaultAnchor)
        
        groupData.slices.forEach((sliceData: any) => {
          // Handle individual slice anchors
          let sliceAnchor: Anchor | undefined = undefined
          if (sliceData.anchor) {
            if (typeof sliceData.anchor === 'string') {
              // Parse legacy "x, y" string format
              const parts = sliceData.anchor.split(',').map((s: string) => parseFloat(s.trim()))
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                sliceAnchor = { x: parts[0], y: parts[1] }
              }
            } else {
              sliceAnchor = sliceData.anchor
            }
          }
          
          const slice: Slices = {
            id: this.nextId++,
            x: sliceData.x,
            y: sliceData.y,
            width: sliceData.width,
            height: sliceData.height,
            color: group.color,
            selected: false,
            group: group,
            anchor: sliceAnchor
          }
          
          group.slices.push(slice)
          this.slices.push(slice)
        })
      })
      
      // Set current group
      if (data.currentGroup && data.currentGroup.name) {
        const foundGroup = groups.find(g => g.name === data.currentGroup.name)
        if (foundGroup) {
          currentGroup = foundGroup
        }
      }
      
      if (groups.length > 0 && !currentGroup) {
        currentGroup = groups[0]
      }
      
      // Restore background image and settings
      if (data.backgroundImage && data.backgroundImage.hasImage && data.backgroundImage.imageData) {
        const img = new Image()
        img.onload = () => {
          this.backgroundImage = img
          this.imageScale = data.backgroundImage.scale || 1
          this.imageOffsetX = data.backgroundImage.offsetX || 0
          this.imageOffsetY = data.backgroundImage.offsetY || 0
          this.draw()
          $('#image-info').show()
          this.updateImageInfo()
        }
        img.src = data.backgroundImage.imageData
      } else {
        // Clear background image if none was saved
        this.backgroundImage = null
        this.imageScale = 1
        this.imageOffsetX = 0
        this.imageOffsetY = 0
        $('#image-info').hide()
      }
      
      this.updateGroupsList()
      this.updateCurrentGroupDisplay()
      this.updateSliceImages()
      this.draw()
      
      alert('Project loaded successfully!')
      
    } catch (error) {
      alert('Invalid project file: ' + (error as Error).message)
    }
  }

  // Image Loading Functions
  public loadImage(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        this.backgroundImage = img
        this.fitImageToCanvas()
        this.draw()
        $('#image-info').show()
        this.updateImageInfo()
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  private fitImageToCanvas() {
    if (!this.backgroundImage) return
    
    const canvasAspect = this.canvas.width / this.canvas.height
    const imageAspect = this.backgroundImage.width / this.backgroundImage.height
    
    if (imageAspect > canvasAspect) {
      // Image is wider - fit to canvas width
      this.imageScale = this.canvas.width / this.backgroundImage.width
    } else {
      // Image is taller - fit to canvas height
      this.imageScale = this.canvas.height / this.backgroundImage.height
    }
    
    // Center the image
    const scaledWidth = this.backgroundImage.width * this.imageScale
    const scaledHeight = this.backgroundImage.height * this.imageScale
    
    this.imageOffsetX = (this.canvas.width - scaledWidth) / 2
    this.imageOffsetY = (this.canvas.height - scaledHeight) / 2
  }

  public resetImageTransform() {
    if (this.backgroundImage) {
      this.fitImageToCanvas()
      this.draw()
      this.updateImageInfo()
    }
  }

  public scaleImage(scaleFactor: number) {
    if (!this.backgroundImage) return
    
    this.imageScale *= scaleFactor
    
    // Prevent scaling too small or too large
    this.imageScale = Math.max(0.1, Math.min(this.imageScale, 5.0))
    
    this.draw()
    this.updateImageInfo()
  }

  public moveImage(deltaX: number, deltaY: number) {
    if (!this.backgroundImage) return
    
    this.imageOffsetX += deltaX
    this.imageOffsetY += deltaY
    
    this.draw()
  }

  public removeImage() {
    this.backgroundImage = null
    this.imageScale = 1
    this.imageOffsetX = 0
    this.imageOffsetY = 0
    this.draw()
    $('#image-info').hide()
  }

  private updateImageInfo() {
    if (!this.backgroundImage) return
    
    $('#image-dimensions').text(`${this.backgroundImage.width} × ${this.backgroundImage.height}`)
    $('#image-scale').text(`${Math.round(this.imageScale * 100)}%`)
  }

  // Slice Image Display Functions
  public updateSliceImages() {
    const sliceImagesContainer = $('#slice-images')
    if (sliceImagesContainer.length === 0) return
    
    sliceImagesContainer.empty()
    
    if (!this.backgroundImage || !currentGroup) {
      sliceImagesContainer.html('<p class="no-images">Load an image and create slices to see them here</p>')
      return
    }
    
    if (currentGroup.slices.length === 0) {
      sliceImagesContainer.html('<p class="no-images">No slices in current group</p>')
      return
    }
    
    // Create slice images
    currentGroup.slices.forEach((slice, index) => {
      const sliceImageData = this.createSliceImageData(slice)
      if (sliceImageData) {
        const sliceElement = $(`
          <div class="slice-item ${slice.selected ? 'selected' : ''}" data-slice-id="${slice.id}" data-frame-index="${index}">
            <div class="slice-image-wrapper">
              <img class="slice-image" src="${sliceImageData.dataUrl}" 
                   width="${sliceImageData.width}" height="${sliceImageData.height}" />
              <div class="slice-overlay">
                <span class="slice-index">${index + 1}</span>
              </div>
            </div>
            <div class="slice-info">
              <div class="slice-size">${slice.width}×${slice.height}</div>
              <div class="slice-coords">(${Math.round(slice.x)}, ${Math.round(slice.y)})</div>
            </div>
          </div>
        `)
        
        sliceImagesContainer.append(sliceElement)
      }
    })
    
    this.setupSliceImageEventListeners()
    
    // Highlight current frame
    this.highlightCurrentFrame()
  }

  private createSliceImageData(slice: Slices): { dataUrl: string, width: number, height: number } | null {
    if (!this.backgroundImage) return null
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    // Set canvas size (limit max size for display)
    const maxSize = 80
    const scale = Math.min(maxSize / slice.width, maxSize / slice.height, 1)
    canvas.width = slice.width * scale
    canvas.height = slice.height * scale
    
    // Calculate source coordinates on the background image
    const sourceX = (slice.x - this.imageOffsetX) / this.imageScale
    const sourceY = (slice.y - this.imageOffsetY) / this.imageScale
    const sourceWidth = slice.width / this.imageScale
    const sourceHeight = slice.height / this.imageScale
    
    // Ensure we don't try to draw outside the image bounds
    const clampedSourceX = Math.max(0, Math.min(sourceX, this.backgroundImage.width))
    const clampedSourceY = Math.max(0, Math.min(sourceY, this.backgroundImage.height))
    const clampedSourceWidth = Math.min(sourceWidth, this.backgroundImage.width - clampedSourceX)
    const clampedSourceHeight = Math.min(sourceHeight, this.backgroundImage.height - clampedSourceY)
    
    if (clampedSourceWidth <= 0 || clampedSourceHeight <= 0) {
      // Slice is outside image bounds, draw a placeholder
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(0, 0, canvas.width, canvas.height)
      
      // Draw "No Image" text
      ctx.fillStyle = '#999'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('No Image', canvas.width / 2, canvas.height / 2)
      
      return { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height }
    }
    
    try {
      // Draw the slice from the background image
      ctx.drawImage(
        this.backgroundImage,
        clampedSourceX, clampedSourceY, clampedSourceWidth, clampedSourceHeight,
        0, 0, canvas.width, canvas.height
      )
      
      // Add a subtle border
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, canvas.width, canvas.height)
      
    } catch (error) {
      console.warn('Error drawing slice:', error)
      // Draw error placeholder
      ctx.fillStyle = '#ffe6e6'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#cc0000'
      ctx.font = '10px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Error', canvas.width / 2, canvas.height / 2)
    }
    
    return { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height }
  }

  private setupSliceImageEventListeners() {
    // Click to select slice
    $('.slice-item').off('click').on('click', (e) => {
      const sliceId = parseInt($(e.currentTarget).data('slice-id'))
      const slice = this.slices.find(s => s.id === sliceId)
      if (slice) {
        // Deselect all slices
        this.slices.forEach(s => s.selected = false)
        // Select clicked slice
        slice.selected = true
        this.draw()
        this.updateSliceImages()
      }
    })
    
    // Double-click to focus on slice
    $('.slice-item').off('dblclick').on('dblclick', (e) => {
      const sliceId = parseInt($(e.currentTarget).data('slice-id'))
      const slice = this.slices.find(s => s.id === sliceId)
      if (slice) {
        this.focusOnSlice(slice)
      }
    })
  }

  private createContextMenu() {
    // Remove existing context menu
    $('#slice-context-menu').remove()
    
    // Create context menu HTML
    const contextMenu = $(`
      <div id="slice-context-menu">
        <div class="context-menu-item" data-action="duplicate">
          <span>📋</span> Duplicate
        </div>
        <div class="context-menu-item danger" data-action="delete">
          <span>🗑️</span> Delete
        </div>
      </div>
    `)
    
    $('body').append(contextMenu)
    
    // Handle context menu clicks
    $('.context-menu-item').on('click', (e) => {
      const action = $(e.currentTarget).data('action')
      const sliceId = parseInt($('#slice-context-menu').data('slice-id'))
      
      if (action === 'duplicate') {
        this.duplicateSlice(sliceId)
      } else if (action === 'delete') {
        this.deleteSlice(sliceId)
      }
      
      this.hideContextMenu()
    })
  }

  private showContextMenu(x: number, y: number, sliceId: number) {
    const contextMenu = $('#slice-context-menu')
    if (contextMenu.length === 0) {
      this.createContextMenu()
    }
    
    contextMenu.data('slice-id', sliceId)
    contextMenu.css({
      left: x + 'px',
      top: y + 'px',
      display: 'block'
    })
  }

  private hideContextMenu() {
    $('#slice-context-menu').hide()
  }

  private focusOnSlice(slice: Slices) {
    if (!this.backgroundImage) return
    
    // Center the slice in the canvas view
    const sliceCenterX = slice.x + slice.width / 2
    const sliceCenterY = slice.y + slice.height / 2
    
    const canvasCenterX = this.canvas.width / 2
    const canvasCenterY = this.canvas.height / 2
    
    this.imageOffsetX = canvasCenterX - (sliceCenterX - this.imageOffsetX)
    this.imageOffsetY = canvasCenterY - (sliceCenterY - this.imageOffsetY)
    
    // Select the slice
    this.slices.forEach(s => s.selected = false)
    slice.selected = true
    
    this.draw()
    this.updateSliceImages()
  }

  public async exportSliceImages() {
    if (!this.backgroundImage || !currentGroup || currentGroup.slices.length === 0) {
      alert('No slices to export!')
      return
    }
    
    // Show export options dialog
    const exportOption = await customPrompt(
      'Choose export option:\n' +
      '1 - Individual PNG files\n' +
      '2 - ZIP file with all slices\n' +
      '3 - Single combined sprite sheet\n' +
      '4 - TexturePacker JSON + Sprite Sheet\n' +
      'Enter 1, 2, 3, or 4:', 
      '1'
    )
    
    switch (exportOption) {
      case '1':
        this.exportIndividualPNGs()
        break
      case '2':
        this.exportAsZip()
        break
      case '3':
        this.exportAsSpriteSheet()
        break
      case '4':
        this.exportAsTexturePacker()
        break
      default:
        if (exportOption) {
          alert('Invalid option. Please choose 1, 2, 3, or 4.')
        }
    }
  }
  
  private exportIndividualPNGs() {
    currentGroup.slices.forEach((slice, index) => {
      const imageData = this.createSliceImageData(slice)
      if (imageData) {
        const link = document.createElement('a')
        link.download = `${currentGroup.name}_slice_${index + 1}.png`
        link.href = imageData.dataUrl
        link.click()
      }
    })
  }
  
  public async exportAsZip() {
    const zip = new JSZip()
    const groupFolder = zip.folder(currentGroup.name)
    
    if (!groupFolder) {
      alert('Failed to create ZIP folder')
      return
    }
    
    // Add each slice to the ZIP
    currentGroup.slices.forEach((slice, index) => {
      const imageData = this.createSliceImageData(slice)
      if (imageData) {
        // Remove the data URL prefix to get just the base64 data
        const base64Data = imageData.dataUrl.split(',')[1]
        groupFolder.file(`slice_${index + 1}.png`, base64Data, { base64: true })
      }
    })
    
    // Generate and download the ZIP file
    try {
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentGroup.name}_slices.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to create ZIP file: ' + error)
    }
  }
  
  public exportAsSpriteSheet() {
    if (currentGroup.slices.length === 0) return
    
    // Calculate optimal grid layout
    const slicesCount = currentGroup.slices.length
    const cols = Math.ceil(Math.sqrt(slicesCount))
    const rows = Math.ceil(slicesCount / cols)
    
    // Find the maximum slice dimensions to ensure uniform grid
    let maxWidth = 0
    let maxHeight = 0
    
    currentGroup.slices.forEach(slice => {
      maxWidth = Math.max(maxWidth, slice.width)
      maxHeight = Math.max(maxHeight, slice.height)
    })
    
    // Create canvas for the sprite sheet
    const spriteCanvas = document.createElement('canvas')
    const spriteCtx = spriteCanvas.getContext('2d')
    
    if (!spriteCtx) {
      alert('Failed to create sprite sheet canvas')
      return
    }
    
    spriteCanvas.width = cols * maxWidth
    spriteCanvas.height = rows * maxHeight
    
    // Fill with transparent background
    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height)
    
    // Draw each slice onto the sprite sheet
    currentGroup.slices.forEach((slice, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * maxWidth
      const y = row * maxHeight
      
      // Draw the background image portion for this slice
      if (this.backgroundImage) {
        spriteCtx.drawImage(
          this.backgroundImage,
          slice.x, slice.y, slice.width, slice.height,
          x, y, slice.width, slice.height
        )
      }
    })
    
    // Download the sprite sheet
    const link = document.createElement('a')
    link.download = `${currentGroup.name}_spritesheet.png`
    link.href = spriteCanvas.toDataURL()
    link.click()
  }

  private exportAllSlicesAsSpriteSheet(allSlices: Slices[], cols: number, rows: number, maxWidth: number, maxHeight: number, filename: string) {
    // Create canvas for the sprite sheet
    const spriteCanvas = document.createElement('canvas')
    const spriteCtx = spriteCanvas.getContext('2d')
    
    if (!spriteCtx) {
      alert('Failed to create sprite sheet canvas')
      return
    }
    
    spriteCanvas.width = cols * maxWidth
    spriteCanvas.height = rows * maxHeight
    
    // Fill with transparent background
    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height)
    
    // Draw each slice onto the sprite sheet
    allSlices.forEach((slice, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * maxWidth
      const y = row * maxHeight
      
      // Draw the background image portion for this slice
      if (this.backgroundImage) {
        spriteCtx.drawImage(
          this.backgroundImage,
          slice.x, slice.y, slice.width, slice.height,
          x, y, slice.width, slice.height
        )
      }
    })
    
    // Download the sprite sheet
    const link = document.createElement('a')
    link.download = filename
    link.href = spriteCanvas.toDataURL()
    link.click()
  }

  /* you had it right the first time what was it .. format as 1 or 2 */
  public async exportAsTexturePacker(exportFormat = 1 | 2) {
    if (currentGroup.slices.length === 0) {
      alert('No slices to export!')
      return
    }

    const useIndividualImages = exportFormat === 1

    // Calculate optimal grid layout
    let allSlices = useIndividualImages ? currentGroup.slices : []
    if (!useIndividualImages) {
      // For sprite sheet mode, collect all slices from all groups
      groups.forEach(group => {
        allSlices = allSlices.concat(group.slices)
      })
    }
    
    const slicesCount = allSlices.length
    const cols = Math.ceil(Math.sqrt(slicesCount))
    const rows = Math.ceil(slicesCount / cols)
    
    // Find the maximum slice dimensions
    let maxWidth = 0
    let maxHeight = 0
    
    allSlices.forEach(slice => {
      maxWidth = Math.max(maxWidth, slice.width)
      maxHeight = Math.max(maxHeight, slice.height)
    })

    const spriteSheetWidth = cols * maxWidth
    const spriteSheetHeight = rows * maxHeight

    // Create the frames object for TexturePacker format
    const frames: { [key: string]: any } = {}
    
    if (useIndividualImages) {
      // For individual images mode, only include current group
      currentGroup.slices.forEach((slice) => {
        const anchor = slice.anchor || currentGroup.default_anchor
        const anchorX = Math.round(slice.width * anchor.x)
        const anchorY = Math.round(slice.height * anchor.y)
        const sliceName = `slice_${slice.id}`
        
        frames[sliceName] = {
          frame: {
            x: 0,
            y: 0,
            w: slice.width,
            h: slice.height
          },
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: slice.width,
            h: slice.height
          },
          sourceSize: {
            w: slice.width,
            h: slice.height
          },
          anchor: {
            x: anchor.x,
            y: anchor.y
          },
          pivot: {
            x: anchorX,
            y: anchorY
          }
        }
      })
    } else {
      // For sprite sheet mode, use the SAME allSlices array to ensure consistent ordering
      allSlices.forEach((slice, index) => {
        const anchor = slice.anchor || slice.group?.default_anchor || ANCHOR_PRESETS.CENTER
        const anchorX = Math.round(slice.width * anchor.x)
        const anchorY = Math.round(slice.height * anchor.y)
        const sliceName = `slice_${slice.id}`
        
        // Calculate position in sprite sheet using the same logic as sprite sheet generation
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = col * maxWidth
        const y = row * maxHeight
        
        frames[sliceName] = {
          frame: {
            x: x,
            y: y,
            w: slice.width,
            h: slice.height
          },
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: slice.width,
            h: slice.height
          },
          sourceSize: {
            w: slice.width,
            h: slice.height
          },
          anchor: {
            x: anchor.x,
            y: anchor.y
          },
          pivot: {
            x: anchorX,
            y: anchorY
          }
        }
      })
    }

    // Create animations object with group names as keys and slice arrays as values
    const animations: { [key: string]: string[] } = {}
    if (useIndividualImages) {
      // For individual images, only include current group
      if (currentGroup.slices.length > 0) {
        const groupSliceNames = currentGroup.slices.map(slice => `slice_${slice.id}`)
        animations[currentGroup.name.replace(/\s+/g, '_')] = groupSliceNames
      }
    } else {
      // For sprite sheet, include all groups
      groups.forEach(group => {
        if (group.slices.length > 0) {
          const groupSliceNames = group.slices.map(slice => `slice_${slice.id}`)
          animations[group.name.replace(/\s+/g, '_')] = groupSliceNames
        }
      })
    }

    // Create the meta object based on export format
    const metaData = useIndividualImages ? {
      app: "CutSprite",
      version: "1.0",
      format: "RGBA8888",
      scale: "1",
      smartupdate: "$TexturePacker:SmartUpdate:0$"
    } : {
      app: "CutSprite",
      version: "1.0",
      image: `${currentGroup.name.replace(/\s+/g, '_')}_spritesheet.png`,
      format: "RGBA8888",
      size: {
        w: spriteSheetWidth,
        h: spriteSheetHeight
      },
      scale: "1",
      frameTags: [
        {
          name: currentGroup.name,
          from: 0,
          to: currentGroup.slices.length - 1,
          direction: "forward"
        }
      ]
    }

    // Create the complete TexturePacker JSON structure
    const texturePackerData = {
      frames: frames,
      animations: animations,
      meta: metaData
    }

    // Create and download the JSON file
    const jsonString = JSON.stringify(texturePackerData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.download = `${currentGroup.name.replace(/\s+/g, '_')}_atlas.json`
    link.href = url
    link.click()
    
    URL.revokeObjectURL(url)
    
    // Generate the appropriate image files
    if (useIndividualImages) {
      // Export individual PNG files
      this.exportIndividualPNGs()
    } else {
      // Export single sprite sheet with all slices
      this.exportAllSlicesAsSpriteSheet(allSlices, cols, rows, maxWidth, maxHeight, `${currentGroup.name.replace(/\s+/g, '_')}_spritesheet.png`)
    }
  }

  // Animation Control Methods
  public playAnimation() {
    if (!currentGroup || currentGroup.slices.length <= 1) {
      return
    }
    
    if (this.isPlaying) {
      this.pauseAnimation()
      return
    }
    
    this.isPlaying = true
    this.isInAnimationMode = true
    this.updatePlayButton()
    // Immediately switch to animation mode display
    this.highlightCurrentFrame()
    
    this.animationInterval = window.setInterval(() => {
      if (!currentGroup || currentGroup.slices.length <= 1) return
      
      // Lightweight frame advancement for smooth animation
      this.currentFrame = (this.currentFrame + 1) % currentGroup.slices.length
      this.updateFrameCounter()
      this.highlightCurrentFrame()
      
      // Only update canvas selection for slower animations
      if (this.fps <= 12 && currentGroup.slices[this.currentFrame]) {
        this.slices.forEach(s => s.selected = false)
        currentGroup.slices[this.currentFrame].selected = true
        this.draw()
      }
    }, 1000 / this.fps)
  }
  
  public pauseAnimation() {
    this.isPlaying = false
    if (this.animationInterval) {
      clearInterval(this.animationInterval)
      this.animationInterval = null
    }
    // Stay in animation mode when paused
    this.updatePlayButton()
    this.highlightCurrentFrame() // Refresh visibility
    this.draw() // Single redraw when pausing
  }
  
  public stopAnimation() {
    this.pauseAnimation()
    this.isInAnimationMode = false // Exit animation mode
    this.currentFrame = 0
    this.updateFrameCounter()
    this.highlightCurrentFrame() // Refresh visibility - will show all frames
    // Regenerate slice images to show all frames when stopping
    this.updateSliceImages()
    this.draw() // Full redraw when stopping
  }
  
  public nextFrame() {
    if (!currentGroup || currentGroup.slices.length <= 1) return
    
    this.isInAnimationMode = true // Enter animation mode
    this.currentFrame = (this.currentFrame + 1) % currentGroup.slices.length
    this.updateFrameCounter()
    this.highlightCurrentFrame()
    
    // Select the current frame slice on canvas
    if (currentGroup.slices[this.currentFrame]) {
      this.slices.forEach(s => s.selected = false)
      currentGroup.slices[this.currentFrame].selected = true
      this.draw()
    }
  }
  
  public prevFrame() {
    if (!currentGroup || currentGroup.slices.length <= 1) return
    
    this.isInAnimationMode = true // Enter animation mode
    this.currentFrame = this.currentFrame <= 0 ? currentGroup.slices.length - 1 : this.currentFrame - 1
    this.updateFrameCounter()
    this.highlightCurrentFrame()
    
    // Select the current frame slice on canvas
    if (currentGroup.slices[this.currentFrame]) {
      this.slices.forEach(s => s.selected = false)
      currentGroup.slices[this.currentFrame].selected = true
      this.draw()
    }
  }
  
  public setFPS(newFPS: number) {
    this.fps = Math.max(1, Math.min(newFPS, 60))
    $('#fps-display').text(`${this.fps} FPS`)
    
    // Restart animation if playing to apply new FPS
    if (this.isPlaying) {
      this.pauseAnimation()
      this.playAnimation()
    }
  }
  
  private updateFrameCounter() {
    if (currentGroup) {
      $('#frame-counter').text(`${this.currentFrame + 1} / ${currentGroup.slices.length}`)
    } else {
      $('#frame-counter').text('0 / 0')
    }
  }
  
  private updatePlayButton() {
    const playBtn = $('#play-pause-btn')
    if (this.isPlaying) {
      playBtn.addClass('playing')
      playBtn.attr('title', 'Pause animation')
    } else {
      playBtn.removeClass('playing')
      playBtn.attr('title', 'Play animation')
    }
  }
  
  private highlightCurrentFrame() {
    // Use direct style manipulation instead of CSS classes to avoid React re-renders
    const $sliceItems = $('.slice-item')
    
    if (this.isInAnimationMode) {
      // In animation mode, hide all frames first using direct style manipulation
      $sliceItems.css('display', 'none').removeClass('current-frame animating')
      $('#slice-images').addClass('animation-mode')
      
      // Show only the current frame
      if (currentGroup && currentGroup.slices.length > 0) {
        const currentSlice = currentGroup.slices[this.currentFrame]
        if (currentSlice) {
          const $currentElement = $(`.slice-item[data-slice-id="${currentSlice.id}"]`)
          $currentElement.css('display', 'block').addClass('current-frame')
          
          if (this.isPlaying) {
            $currentElement.addClass('animating')
          }
          
          // Scroll to current frame in film strip
          this.scrollToCurrentFrame($currentElement)
        }
      }
    } else {
      // Default state - show all frames using direct style manipulation
      $sliceItems.css('display', 'block').removeClass('current-frame animating hidden-frame')
      $('#slice-images').removeClass('animation-mode')
    }
  }
  
  private scrollToCurrentFrame(sliceElement: JQuery) {
    const container = $('#slice-images')
    if (container.length && sliceElement.length) {
      const containerWidth = container.width()!
      const elementLeft = sliceElement.position().left
      const elementWidth = sliceElement.outerWidth()!
      const scrollLeft = container.scrollLeft()!
      
      // Calculate if element is out of view
      if (elementLeft < 0) {
        // Element is to the left of visible area
        container.scrollLeft(scrollLeft + elementLeft - 20)
      } else if (elementLeft + elementWidth > containerWidth) {
        // Element is to the right of visible area
        container.scrollLeft(scrollLeft + (elementLeft + elementWidth - containerWidth) + 20)
      }
    }
  }
}

// Button click handler functions
async function addGroup() {
  const name = await customPrompt('Enter group name:', `Group ${groups.length + 1}`)
  if (name && name.trim()) {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8']
    const color = colors[groups.length % colors.length]
    const newGroup = slicerTool.createGroup(name.trim(), color)
    slicerTool.setCurrentGroup(newGroup)
  }
}

function saveProject() {
  const projectData = slicerTool.saveProject()
  const blob = new Blob([projectData], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sprite_project.json'
  a.click()
  URL.revokeObjectURL(url)
}

function loadProject() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        slicerTool.loadProject(content)
      }
      reader.readAsText(file)
    }
  }
  input.click()
}

function exportSingleImage() {
  slicerTool.exportAsSpriteSheet()
}

function exportAllImages() {
  slicerTool.exportAsZip()
}

function exportTexturePackerSheet() {
  slicerTool.exportAsTexturePacker(2);
}
function exportTexturePacker() {
  slicerTool.exportAsTexturePacker(1);
}

function playPause() {
  slicerTool.playAnimation()
}

function stop() {
  slicerTool.stopAnimation()
}

function prevFrame() {
  slicerTool.prevFrame()
}

function nextFrame() {
  slicerTool.nextFrame()
}

function loadImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      slicerTool.loadImage(file)
    }
  }
  input.click()
}

function removeImage() {
  slicerTool.removeImage()
}

function resetImage() {
  slicerTool.resetImageTransform()
}

function zoomIn() {
  slicerTool.scaleImage(1.2)
}

function zoomOut() {
  slicerTool.scaleImage(0.8)
}

// Global reference to rectangleTool for functions
let slicerTool: SliceTool

$(document).ready(() => {
  const canvas = $('#canvas')[0] as HTMLCanvasElement
  canvas.width = 1280
  canvas.height = 720
  
  slicerTool = new SliceTool(canvas)
  
  // Initialize groups UI
  slicerTool.updateGroupsList()
  slicerTool.updateCurrentGroupDisplay()
  slicerTool.updateSliceImages()
  slicerTool.initializeAnchorControls()
  
  // Add new group button
  $('#add-group-btn').on('click', addGroup)
  
  // Project Save/Load functionality
  $('#save-project-btn').on('click', saveProject)
  $('#load-project-btn').on('click', loadProject)
  
  // Export buttons
  $('#export-single-image').on('click', exportSingleImage)
  $('#export-all-images').on('click', exportAllImages)
  $('#export-texture-packer').on('click', exportTexturePacker)
  $('#export-texture-packer-sheet').on('click', exportTexturePackerSheet)
  
  // Animation controls
  $('#play-pause-btn').on('click', playPause)
  $('#stop-btn').on('click', stop)
  $('#prev-frame-btn').on('click', prevFrame)
  $('#next-frame-btn').on('click', nextFrame)
  
  // Anchor control event handlers
  
  // Group anchor controls
  $('#group-anchor-x, #group-anchor-y').on('input', () => {
    const x = Math.max(0, Math.min(1, parseFloat($('#group-anchor-x').val() as string) || 0))
    const y = Math.max(0, Math.min(1, parseFloat($('#group-anchor-y').val() as string) || 0))
    slicerTool.setGroupDefaultAnchor(currentGroup, { x, y })
    slicerTool.updateGroupAnchorVisual({ x, y })
    slicerTool.draw() // Redraw canvas to show updated anchor positions
  })
  
  $('#group-anchor-preset').on('change', () => {
    const presetKey = $('#group-anchor-preset').val() as string
    if (presetKey && (ANCHOR_PRESETS as any)[presetKey]) {
      const preset = (ANCHOR_PRESETS as any)[presetKey]
      $('#group-anchor-x').val(preset.x.toFixed(2))
      $('#group-anchor-y').val(preset.y.toFixed(2))
      slicerTool.setGroupDefaultAnchor(currentGroup, preset)
      slicerTool.updateGroupAnchorVisual(preset)
      slicerTool.draw() // Redraw canvas to show updated anchor positions
    }
  })
  
  // Slice anchor controls
  $('#slice-anchor-inherit').on('change', () => {
    const selectedSlices = slicerTool.getSelectedSlices()
    if (selectedSlices.length === 1) {
      const slice = selectedSlices[0]
      const isInherit = $('#slice-anchor-inherit').prop('checked')
      if (isInherit) {
        slicerTool.setSliceAnchor(slice, undefined)
      } else {
        // Set to current group's default anchor as starting point
        slicerTool.setSliceAnchor(slice, currentGroup.default_anchor)
        $('#slice-anchor-x').val(currentGroup.default_anchor.x.toFixed(2))
        $('#slice-anchor-y').val(currentGroup.default_anchor.y.toFixed(2))
        slicerTool.updateSliceAnchorVisual(currentGroup.default_anchor)
        slicerTool.updateSliceAnchorInfo(slice, currentGroup.default_anchor)
      }
      slicerTool.draw() // Redraw canvas to show updated anchor positions
    }
  })
  
  $('#slice-anchor-x, #slice-anchor-y').on('input', () => {
    const selectedSlices = slicerTool.getSelectedSlices()
    if (selectedSlices.length === 1) {
      const x = Math.max(0, Math.min(1, parseFloat($('#slice-anchor-x').val() as string) || 0))
      const y = Math.max(0, Math.min(1, parseFloat($('#slice-anchor-y').val() as string) || 0))
      const anchor = { x, y }
      slicerTool.setSliceAnchor(selectedSlices[0], anchor)
      slicerTool.updateSliceAnchorVisual(anchor)
      slicerTool.updateSliceAnchorInfo(selectedSlices[0], anchor)
      slicerTool.draw() // Redraw canvas to show updated anchor positions
    }
  })
  
  $('#slice-anchor-preset').on('change', () => {
    const selectedSlices = slicerTool.getSelectedSlices()
    if (selectedSlices.length === 1) {
      const presetKey = $('#slice-anchor-preset').val() as string
      if (presetKey && (ANCHOR_PRESETS as any)[presetKey]) {
        const preset = (ANCHOR_PRESETS as any)[presetKey]
        $('#slice-anchor-x').val(preset.x.toFixed(2))
        $('#slice-anchor-y').val(preset.y.toFixed(2))
        slicerTool.setSliceAnchor(selectedSlices[0], preset)
        slicerTool.updateSliceAnchorVisual(preset)
        slicerTool.updateSliceAnchorInfo(selectedSlices[0], preset)
      }
      slicerTool.draw() // Redraw canvas to show updated anchor positions
    }
  })

  // Visual anchor grid interactions
  $('#group-anchor-grid').on('click', (e) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    
    // Clamp values to valid range
    const anchorX = Math.max(0, Math.min(1, x))
    const anchorY = Math.max(0, Math.min(1, y))
    
    // Update inputs and anchor
    $('#group-anchor-x').val(anchorX.toFixed(2))
    $('#group-anchor-y').val(anchorY.toFixed(2))
    slicerTool.setGroupDefaultAnchor(currentGroup, { x: anchorX, y: anchorY })
    slicerTool.updateGroupAnchorVisual({ x: anchorX, y: anchorY })
    slicerTool.draw()
  })

  $('#slice-anchor-grid').on('click', (e) => {
    const selectedSlices = slicerTool.getSelectedSlices()
    if (selectedSlices.length === 1) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      
      // Clamp values to valid range
      const anchorX = Math.max(0, Math.min(1, x))
      const anchorY = Math.max(0, Math.min(1, y))
      
      // Update inputs and anchor
      $('#slice-anchor-x').val(anchorX.toFixed(2))
      $('#slice-anchor-y').val(anchorY.toFixed(2))
      const newAnchor = { x: anchorX, y: anchorY }
      slicerTool.setSliceAnchor(selectedSlices[0], newAnchor)
      slicerTool.updateSliceAnchorVisual(newAnchor)
      slicerTool.updateSliceAnchorInfo(selectedSlices[0], newAnchor)
      slicerTool.draw()
      
      // Uncheck inherit if it was checked
      $('#slice-anchor-inherit').prop('checked', false)
    }
  })

  // Hover tooltips for anchor grids
  $('#group-anchor-grid, #slice-anchor-grid').on('mousemove', (e) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    
    // Clamp values to valid range
    const anchorX = Math.max(0, Math.min(1, x))
    const anchorY = Math.max(0, Math.min(1, y))
    
    // Create or update tooltip
    let tooltip = $('.anchor-tooltip')
    if (tooltip.length === 0) {
      tooltip = $('<div class="anchor-tooltip"></div>')
      $('body').append(tooltip)
    }
    
    tooltip.text(`${anchorX.toFixed(2)}, ${anchorY.toFixed(2)}`)
    tooltip.css({
      left: e.clientX + 'px',
      top: e.clientY + 'px',
      display: 'block'
    })
  })

  $('#group-anchor-grid, #slice-anchor-grid').on('mouseleave', () => {
    $('.anchor-tooltip').hide()
  })

  // Global click handler to hide context menu
  $(document).on('click', (e) => {
    if (!$(e.target).closest('#slice-context-menu').length) {
      $('#slice-context-menu').hide()
    }
  })

  // FPS control with keyboard
  $(document).keydown((e: any) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      slicerTool.deleteSelected()
    } else if (e.key === 'Escape') {
      slicerTool.clearAll()
    } else if (e.key === 'ArrowUp' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(0, -10)
    } else if (e.key === 'ArrowDown' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(0, 10)
    } else if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(-10, 0)
    } else if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(10, 0)
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      slicerTool.prevFrame()
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      slicerTool.nextFrame()
    } else if (e.key === ' ') {
      e.preventDefault()
      slicerTool.playAnimation()
    } else if (e.key === '+' || e.key === '=') {
      slicerTool.setFPS(slicerTool.fps + 1)
    } else if (e.key === '-') {
      slicerTool.setFPS(slicerTool.fps - 1)
    } else if (e.key === 'd' && e.ctrlKey) {
      e.preventDefault()
      const selected = slicerTool.getSelectedSlices()[0];
      if (selected) slicerTool.duplicateSlice(selected.id)
    }
  })
  
  // Image controls
  $('#load-image-btn').on('click', loadImage)
  $('#remove-image-btn').on('click', removeImage)
  $('#reset-image-btn').on('click', resetImage)
  $('#zoom-in-btn').on('click', zoomIn)
  $('#zoom-out-btn').on('click', zoomOut)
  
  // Image movement with arrow keys
  $(document).keydown((e: any) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      slicerTool.deleteSelected()
    } else if (e.key === 'Escape') {
      slicerTool.clearAll()
    } else if (e.key === 'ArrowUp' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(0, -10)
    } else if (e.key === 'ArrowDown' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(0, 10)
    } else if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(-10, 0)
    } else if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault()
      slicerTool.moveImage(10, 0)
    }
  })

  
  // Make sure the canvas can receive focus for keyboard events
  canvas.tabIndex = 0
  canvas.focus()
})

// Example: Fill the canvas with a color

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
