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
            
            <div id="anchor-panel">
              <h5>Anchors</h5>
              <div id="group-anchor-control" className="anchor-control">
                <div className="anchor-label">Group Default Anchor</div>
                <div className="anchor-inputs">
                  <div className="anchor-input-group">
                    <label>X:</label>
                    <input type="number" min="0" max="1" step="0.1" className="anchor-input anchor-x-input" id="group-anchor-x" />
                  </div>
                  <div className="anchor-input-group">
                    <label>Y:</label>
                    <input type="number" min="0" max="1" step="0.1" className="anchor-input anchor-y-input" id="group-anchor-y" />
                  </div>
                </div>
                <div className="anchor-preset">
                  <label>Preset:</label>
                  <select className="anchor-preset-select" id="group-anchor-preset">
                    <option value="">Custom</option>
                    <option value="TOP_LEFT">Top Left (0,0)</option>
                    <option value="TOP_CENTER">Top Center (0.5,0)</option>
                    <option value="TOP_RIGHT">Top Right (1,0)</option>
                    <option value="CENTER_LEFT">Center Left (0,0.5)</option>
                    <option value="CENTER">Center (0.5,0.5)</option>
                    <option value="CENTER_RIGHT">Center Right (1,0.5)</option>
                    <option value="BOTTOM_LEFT">Bottom Left (0,1)</option>
                    <option value="BOTTOM_CENTER">Bottom Center (0.5,1)</option>
                    <option value="BOTTOM_RIGHT">Bottom Right (1,1)</option>
                  </select>
                </div>
                <div className="anchor-visual">
                  <div className="anchor-grid" id="group-anchor-grid">
                    <div className="anchor-custom-point" id="group-anchor-indicator"></div>
                  </div>
                </div>
              </div>
              
              <div className="slice-anchor-controls" id="slice-anchor-controls">
                <div className="anchor-inherit-toggle">
                  <input type="checkbox" id="slice-anchor-inherit" className="anchor-inherit-checkbox" />
                  <label htmlFor="slice-anchor-inherit">Inherit from group</label>
                </div>
                
                <div id="slice-anchor-control" className="anchor-control">
                  <div className="anchor-label">Slice Anchor</div>
                  <div className="anchor-inputs">
                    <div className="anchor-input-group">
                      <label>X:</label>
                      <input type="number" min="0" max="1" step="0.1" className="anchor-input anchor-x-input" id="slice-anchor-x" />
                    </div>
                    <div className="anchor-input-group">
                      <label>Y:</label>
                      <input type="number" min="0" max="1" step="0.1" className="anchor-input anchor-y-input" id="slice-anchor-y" />
                    </div>
                  </div>
                  <div className="anchor-preset">
                    <label>Preset:</label>
                    <select className="anchor-preset-select" id="slice-anchor-preset">
                      <option value="">Custom</option>
                      <option value="TOP_LEFT">Top Left (0,0)</option>
                      <option value="TOP_CENTER">Top Center (0.5,0)</option>
                      <option value="TOP_RIGHT">Top Right (1,0)</option>
                      <option value="CENTER_LEFT">Center Left (0,0.5)</option>
                      <option value="CENTER">Center (0.5,0.5)</option>
                      <option value="CENTER_RIGHT">Center Right (1,0.5)</option>
                      <option value="BOTTOM_LEFT">Bottom Left (0,1)</option>
                      <option value="BOTTOM_CENTER">Bottom Center (0.5,1)</option>
                      <option value="BOTTOM_RIGHT">Bottom Right (1,1)</option>
                    </select>
                  </div>
                  <div className="anchor-visual">
                    <div className="anchor-grid" id="slice-anchor-grid">
                      <div className="anchor-custom-point" id="slice-anchor-indicator"></div>
                    </div>
                  </div>
                  <div id="slice-anchor-info" className="anchor-info">
                    <div className="anchor-position-info">Position: <span id="slice-anchor-position">0, 0</span></div>
                    <div className="anchor-size-info">Size: <span id="slice-size-info">0 × 0</span></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div id="image-controls">
              <h5>Background Image</h5>
              <div id="image-toolbar">
                <button id="load-image-btn" title="Load sprite sheet image">📁 Load Image</button>
                <button id="remove-image-btn" title="Remove background image">🗑️</button>
                <div className="color-replacement-section">
                  <div className="color-picker-row">
                    <button id="eyedropper-btn" title="Click to activate eye dropper, then click on canvas to pick color">🔍 Eye Dropper</button>
                    <div className="picked-color-display">
                      <span>Picked Color:</span>
                      <div id="picked-color-swatch" style={{backgroundColor: '#FFFFFF', width: '30px', height: '20px', border: '1px solid #ccc', display: 'inline-block'}}></div>
                      <span id="picked-color-value">#FFFFFF</span>
                    </div>
                  </div>
                  <div className="tolerance-row">
                    <label htmlFor="tolerance-slider">Tolerance:</label>
                    <input type="range" id="tolerance-slider" min="0" max="255" defaultValue="10" />
                    <span id="tolerance-value">10</span>
                    <button id="replace-color-btn" title="Replace picked color with transparency">🎨 Remove Color</button>
                  </div>
                </div>
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
              <p>⌨️ Tab/Shift+Tab: Navigate slices</p>
              <p>⌨️ Shift+Arrows: Move background image</p>
              <p>⌨️ Arrow Keys: Nudge selected slice</p>
              <p>⌨️ Alt+Arrow Keys: Resize selected slice</p>
              <p>⌨️ Ctrl+Arrow Keys: Resize opposite edge</p>
              <hr />
              <p><strong>Anchors:</strong></p>
              <p>🎯 <span style={{color: '#ffaa00'}}>●</span> Inherited anchor (from group)</p>
              <p>🎯 <span style={{color: '#ff6600'}}>●</span> Custom slice anchor</p>
              <p>📍 0,0 = top-left, 1,1 = bottom-right</p>
            </div>
          </div>
        </div>
        
        <div id="main-content">

          <div id="slice-images-wrapper">
          <div id="slice-images-container">
            <div id="slice-images-header">
              <h3>Slice Images</h3>
              <div id="export-buttons">
                <button id="export-single-image" title="Export as single sprite sheet image">🇺️ Single Image</button>
                <button id="export-all-images" title="Export all slices as ZIP file">🗂️ ZIP File</button>
                {/* <button id="export-texture-packer" title="Export as TexturePacker JSON + Sprite Sheet">📋 TexturePacker Singles</button> */}
                <button id="export-texture-packer-sheet" title="Export as TexturePacker JSON + Sprite Sheet">📋 TexturePacker Sheet</button>
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
          </div>

          <div id="container">
            <canvas id="canvas"></canvas>
          </div>
        </div>
      </div>

      {/* Custom Modal Dialog */}
      <div id="modal-overlay" className="modal-overlay" style={{display: 'none'}}>
        <div id="modal-dialog" className="modal-dialog">
          <div className="modal-header">
            <h4 id="modal-title">Input Required</h4>
            <button id="modal-close" className="modal-close-btn">&times;</button>
          </div>
          <div className="modal-body">
            <label id="modal-message" htmlFor="modal-input">Please enter a value:</label>
            <input type="text" id="modal-input" className="modal-input" autoFocus />
          </div>
          <div className="modal-footer">
            <button id="modal-cancel" className="modal-btn modal-btn-cancel">Cancel</button>
            <button id="modal-ok" className="modal-btn modal-btn-ok">OK</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
