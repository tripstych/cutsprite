import { } from 'react'
import './App.css'

function App() {
  return (
    <>
      <div id="app-container">
        <div id="sidebar">
          <div id="groups-panel">
            <div id="groups-header">
              <h3>Groups & Slices</h3>
              <div id="groups-toolbar">
                <button id="add-group-btn" title="Add new group">+ Group</button>
                <button id="save-project-btn" title="Save project">� Save</button>
                <button id="load-project-btn" title="Load project">� Load</button>
              </div>
            </div>
            <div id="groups-list"></div>
          </div>
          
          <div id="tools-panel">
            <h4>Tools</h4>
            <div id="current-group-info">
              <div>Current Group: <span id="current-group-name">Group 1</span></div>
            </div>
            
            <div id="image-controls">
              <h5>Background Image</h5>
              <div id="image-toolbar">
                <button id="load-image-btn" title="Load sprite sheet image">📁 Load Image</button>
                <button id="remove-image-btn" title="Remove background image">🗑️</button>
              </div>
              <div id="image-info" style={{display: 'none'}}>
                <div className="image-detail">Size: <span id="image-dimensions"></span></div>
                <div className="image-detail">Scale: <span id="image-scale"></span></div>
                <div id="image-transform-controls">
                  <button id="zoom-in-btn" title="Zoom in">🔍+</button>
                  <button id="zoom-out-btn" title="Zoom out">🔍-</button>
                  <button id="reset-image-btn" title="Reset zoom and position">🔄</button>
                </div>
              </div>
            </div>
            
            <div id="tool-info">
              <p>🖱️ Click & drag to create slices</p>
              <p>🔧 Drag existing slices to move them</p>
              <p>⌨️ Delete/Backspace: Remove selected</p>
              <p>⌨️ Escape: Clear all</p>
              <p>⌨️ Shift+Arrows: Move background image</p>
            </div>
          </div>
        </div>
        
        <div id="main-content">
          <div id="slice-images-container">
            <div id="slice-images-header">
              <h3>Slice Images</h3>
              <div id="export-buttons">
                <button id="export-single-image" title="Export as single sprite sheet image">🇺️ Single Image</button>
                <button id="export-all-images" title="Export all slices as ZIP file">🗂️ ZIP File</button>
              </div>
            </div>
            <div id="slice-images"></div>
            <div id="slice-controls">
              <button className="prev-button" id="prev-frame-btn" title="Previous frame"></button>
              <button className="play-button" id="play-pause-btn" title="Play/Pause animation"></button>
              <button className="stop-button" id="stop-btn" title="Stop animation"></button>
              <button className="next-button" id="next-frame-btn" title="Next frame"></button>
              <div id="frame-info">
                <div id="frame-counter">1 / 1</div>
                <div id="fps-display">12 FPS</div>
              </div>
            </div>
          </div>
          <div id="container">
            <canvas id="canvas"></canvas>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
