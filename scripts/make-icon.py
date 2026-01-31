
import os

class PixelCanvas:
    def __init__(self, width, height, pixel_size=10):
        self.width = width
        self.height = height
        self.pixel_size = pixel_size
        self.pixels = {}

    def set_pixel(self, x, y, color):
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[(x, y)] = color

    def fill_rect(self, x, y, w, h, color):
        for i in range(x, x + w):
            for j in range(y, y + h):
                self.set_pixel(i, j, color)

    def to_svg(self):
        real_w = self.width * self.pixel_size
        real_h = self.height * self.pixel_size
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {real_w} {real_h}" width="{real_w}" height="{real_h}">']
        
        # Group by color
        by_color = {}
        for (x, y), color in self.pixels.items():
            if color not in by_color: by_color[color] = []
            by_color[color].append((x, y))
            
        for color, coords in by_color.items():
            path_d = []
            for x, y in coords:
                px = x * self.pixel_size
                py = y * self.pixel_size
                svg.append(f'<rect x="{px}" y="{py}" width="{self.pixel_size}" height="{self.pixel_size}" fill="{color}" shape-rendering="crispEdges" />')
        
        svg.append('</svg>')
        return "\n".join(svg)

def generate_icon():
    # Double resolution for smoother diagonal edges
    w, h = 48, 48
    canvas = PixelCanvas(w, h, pixel_size=8)
    
    # Bigger Cube (Doubled)
    s = 36 # Size (was 18)
    d = 8  # Depth (was 4)
    
    # Centering (Doubled)
    # fx = 1 -> 2
    # fy = 5 -> 10
    
    fx, fy = 2, 10
    
    # Colors (Darkened for drama)
    # Side: Was #999999 -> #666666. New: #777777 -> #444444
    c_side_light = '#777777' 
    c_side_dark  = '#444444' 
    
    # Top: Was #FFFFFF -> #CCCCCC. New: #CCCCCC -> #999999
    c_top_light  = '#E0E0E0' # Start slightly off-white to distinguish from Front face
    c_top_dark   = '#999999' 
    
    # Bayer Matrix 4x4
    # 0..15
    bayer = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ]
    
    def get_dither_color(x, y, brightness, c_light, c_dark):
        # brightness 0.0 to 1.0
        # threshold from 0.0 to 0.9375
        threshold = bayer[y % 4][x % 4] / 16.0
        
        # brightness > threshold = light color
        if brightness > threshold:
            return c_light
        return c_dark

    # Side Face (Right)
    for i in range(s):
        for j in range(d):
            px = fx + s + j
            py = fy + i - j - 1
            
            # Brightness calculation
            dist = i + j * 3 
            max_dist = s + d * 3
            
            # Normalize distance 0..1
            norm_dist = dist / max_dist
            
            # Quadratic falloff for "Physical" point light feeling (Hotspot is focused)
            # Brightness = (1 - dist)^2
            br = (1.0 - norm_dist) ** 1.5 # Adjusted power for drama
            # Bias slightly higher to ensure at least some light
            br = br * 1.1

            canvas.set_pixel(px, py, get_dither_color(px, py, br, c_side_light, c_side_dark))
            
    # Top Face
    for i in range(s):
        for j in range(d):
            px = fx + i + j + 1
            py = fy - j - 1
            
            # Brightness
            dist = i + j*3
            max_dist = s + d*3
            
            norm_dist = dist / max_dist
            br = (1.0 - norm_dist) ** 1.5
            br = br * 1.1
            
            canvas.set_pixel(px, py, get_dither_color(px, py, br, c_top_light, c_top_dark))

    # Front Face (Subtle Dither)
    c_front_light = '#FFFFFF'
    c_front_dark  = '#E0E0E0' # Subtle Grey for falloff
    
    for i in range(s):
        for j in range(s): # Front face is s x s
            px = fx + i
            py = fy + j
            
            # Hotspot at Top-Left (0, 0)
            dist = i + j
            max_dist = s * 2
            
            norm_dist = dist / max_dist
            br = (1.0 - norm_dist) ** 1.5
            br = br * 1.1        

            canvas.set_pixel(px, py, get_dither_color(px, py, br, c_front_light, c_front_dark))

    # The 'FL'
    # Centered on Front Face
    
    fl_pixels = [
        # F (at x=0)
        (0, 0), (1, 0), (2, 0),
        (0, 1),
        (0, 2), (1, 2),
        (0, 3),
        (0, 4),
        
        # L (at x=4)
        (4, 0),
        (4, 1),
        (4, 2),
        (4, 3),
        (4, 4), (5, 4), (6, 4)
    ]
    
    # Scale calculation
    # Previous scale was 2 (total 14x10) on s=18.
    # Now s=36. We can use scale 4.
    
    scale = 4
    total_w = 7 * scale
    total_h = 5 * scale
    
    ox = fx + (s - total_w) // 2
    oy = fy + (s - total_h) // 2
    
    for px, py in fl_pixels:
         canvas.fill_rect(ox + px*scale, oy + py*scale, scale, scale, '#000000')
         
    return canvas.to_svg()

if __name__ == "__main__":
    svg = generate_icon()
    with open("assets/icon.svg", "w") as f:
        f.write(svg)
    print("Generated assets/icon.svg")
