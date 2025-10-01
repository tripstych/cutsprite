import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import $ from 'jquery'
import JSZip from 'jszip'

interface Groups {
  name: string,
  color: string,
  default_anchor: string,
  slices: Slices[]
}

let groups: Groups[] = [{
  name: "Group 1",
  color: "#ff6b6b",
  default_anchor: "0.5, 0.5",
  slices: []
}]
let currentGroup = groups[0];

interface Slices {
  id: number,
  group: Groups | null,
  x: number
  y: number
  width: number
  height: number
  color: string
  selected: boolean
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

  private draw() {
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
      }
    })
    
    // Update slice images if they need refreshing
    this.updateSliceImages()
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
  public createGroup(name: string, color: string, defaultAnchor: string = "0.5, 0.5"): Groups {
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
  }

  public updateCurrentGroupDisplay() {
    const currentGroupName = $('#current-group-name')
    if (currentGroupName.length > 0) {
      currentGroupName.text(currentGroup.name)
      currentGroupName.css('color', currentGroup.color)
    }
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
            <div class="group-anchor">Anchor: ${group.default_anchor}</div>
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
    $('.btn-rename').off('click').on('click', (e) => {
      e.stopPropagation()
      const index = parseInt($(e.currentTarget).closest('.group-item').data('group-index'))
      const group = groups[index]
      const newName = prompt('Enter new group name:', group.name)
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
          height: slice.height
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
        const group = this.createGroup(groupData.name, groupData.color, groupData.default_anchor)
        
        groupData.slices.forEach((sliceData: any) => {
          const slice: Slices = {
            id: this.nextId++,
            x: sliceData.x,
            y: sliceData.y,
            width: sliceData.width,
            height: sliceData.height,
            color: group.color,
            selected: false,
            group: group
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
          height: slice.height
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
        const group = this.createGroup(groupData.name, groupData.color, groupData.default_anchor)
        
        groupData.slices.forEach((sliceData: any) => {
          const slice: Slices = {
            id: this.nextId++,
            x: sliceData.x,
            y: sliceData.y,
            width: sliceData.width,
            height: sliceData.height,
            color: group.color,
            selected: false,
            group: group
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

  public exportSliceImages() {
    if (!this.backgroundImage || !currentGroup || currentGroup.slices.length === 0) {
      alert('No slices to export!')
      return
    }
    
    // Show export options dialog
    const exportOption = prompt(
      'Choose export option:\n' +
      '1 - Individual PNG files (current behavior)\n' +
      '2 - ZIP file with all slices\n' +
      '3 - Single combined sprite sheet\n' +
      'Enter 1, 2, or 3:'
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
      default:
        alert('Invalid option. Please choose 1, 2, or 3.')
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
    this.highlightCurrentFrame()
    
    this.animationInterval = window.setInterval(() => {
      this.nextFrame()
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
  }
  
  public stopAnimation() {
    this.pauseAnimation()
    this.isInAnimationMode = false // Exit animation mode
    this.currentFrame = 0
    this.updateCurrentFrame()
    this.highlightCurrentFrame() // Refresh visibility - will show all frames
  }
  
  public nextFrame() {
    if (!currentGroup || currentGroup.slices.length <= 1) return
    
    this.isInAnimationMode = true // Enter animation mode
    this.currentFrame = (this.currentFrame + 1) % currentGroup.slices.length
    this.updateCurrentFrame()
  }
  
  public prevFrame() {
    if (!currentGroup || currentGroup.slices.length <= 1) return
    
    this.isInAnimationMode = true // Enter animation mode
    this.currentFrame = this.currentFrame <= 0 ? currentGroup.slices.length - 1 : this.currentFrame - 1
    this.updateCurrentFrame()
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
  
  private updateCurrentFrame() {
    this.updateFrameCounter()
    this.updateSliceImages()
    this.highlightCurrentFrame()
    
    // Select the current frame slice on canvas
    if (currentGroup && currentGroup.slices.length > 0) {
      const currentSlice = currentGroup.slices[this.currentFrame]
      if (currentSlice) {
        this.slices.forEach(s => s.selected = false)
        currentSlice.selected = true
        this.draw()
      }
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
    $('.slice-item').removeClass('current-frame animating')
    
    if (this.isInAnimationMode) {
      // In animation mode, hide all frames except the current one
      $('.slice-item').addClass('hidden-frame')
    } else {
      // Default state - show all frames
      $('.slice-item').removeClass('hidden-frame')
    }
    
    if (currentGroup && currentGroup.slices.length > 0) {
      const currentSlice = currentGroup.slices[this.currentFrame]
      if (currentSlice) {
        const sliceElement = $(`.slice-item[data-slice-id="${currentSlice.id}"]`)
        sliceElement.addClass('current-frame').removeClass('hidden-frame')
        
        if (this.isPlaying) {
          sliceElement.addClass('animating')
        }
        
        // Scroll to current frame in film strip
        this.scrollToCurrentFrame(sliceElement)
      }
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

$(document).ready(() => {
  const canvas = $('#canvas')[0] as HTMLCanvasElement
  canvas.width = 1280
  canvas.height = 720
  
  const rectangleTool = new SliceTool(canvas)
  
  // Initialize groups UI
  rectangleTool.updateGroupsList()
  rectangleTool.updateCurrentGroupDisplay()
  rectangleTool.updateSliceImages()
  
  // Add new group button
  $('#add-group-btn').on('click', () => {
    const name = prompt('Enter group name:', `Group ${groups.length + 1}`)
    if (name && name.trim()) {
      const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8']
      const color = colors[groups.length % colors.length]
      const newGroup = rectangleTool.createGroup(name.trim(), color)
      rectangleTool.setCurrentGroup(newGroup)
    }
  })
  
  // Project Save/Load functionality
  $('#save-project-btn').on('click', () => {
    const projectData = rectangleTool.saveProject()
    const blob = new Blob([projectData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sprite_project.json'
    a.click()
    URL.revokeObjectURL(url)
  })
  
  $('#load-project-btn').on('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          rectangleTool.loadProject(content)
        }
        reader.readAsText(file)
      }
    }
    input.click()
  })
  
  // Export as single sprite sheet image
  $('#export-single-image').on('click', () => {
    rectangleTool.exportAsSpriteSheet()
  })
  
  // Export all images as ZIP file
  $('#export-all-images').on('click', () => {
    rectangleTool.exportAsZip()
  })
  
  // Animation controls
  $('#play-pause-btn').on('click', () => {
    rectangleTool.playAnimation()
  })
  
  $('#stop-btn').on('click', () => {
    rectangleTool.stopAnimation()
  })
  
  $('#prev-frame-btn').on('click', () => {
    rectangleTool.prevFrame()
  })
  
  $('#next-frame-btn').on('click', () => {
    rectangleTool.nextFrame()
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
      rectangleTool.deleteSelected()
    } else if (e.key === 'Escape') {
      rectangleTool.clearAll()
    } else if (e.key === 'ArrowUp' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(0, -10)
    } else if (e.key === 'ArrowDown' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(0, 10)
    } else if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(-10, 0)
    } else if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(10, 0)
    } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
      e.preventDefault()
      rectangleTool.prevFrame()
    } else if (e.key === 'ArrowRight' && !e.shiftKey) {
      e.preventDefault()
      rectangleTool.nextFrame()
    } else if (e.key === ' ') {
      e.preventDefault()
      rectangleTool.playAnimation()
    } else if (e.key === '+' || e.key === '=') {
      rectangleTool.setFPS(rectangleTool.fps + 1)
    } else if (e.key === '-') {
      rectangleTool.setFPS(rectangleTool.fps - 1)
    }
  })
  
  // Image loading functionality
  $('#load-image-btn').on('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        rectangleTool.loadImage(file)
      }
    }
    input.click()
  })
  
  $('#remove-image-btn').on('click', () => {
    rectangleTool.removeImage()
  })
  
  $('#reset-image-btn').on('click', () => {
    rectangleTool.resetImageTransform()
  })
  
  $('#zoom-in-btn').on('click', () => {
    rectangleTool.scaleImage(1.2)
  })
  
  $('#zoom-out-btn').on('click', () => {
    rectangleTool.scaleImage(0.8)
  })
  
  // Image movement with arrow keys
  $(document).keydown((e: any) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      rectangleTool.deleteSelected()
    } else if (e.key === 'Escape') {
      rectangleTool.clearAll()
    } else if (e.key === 'ArrowUp' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(0, -10)
    } else if (e.key === 'ArrowDown' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(0, 10)
    } else if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(-10, 0)
    } else if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault()
      rectangleTool.moveImage(10, 0)
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
