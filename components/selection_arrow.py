"""
Created on %(date)s

@author: David den Uyl (ddenuyl@bebr.nl)
"""
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import Canvas
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage


@dataclass
class SelectionArrow:
    master: Canvas
    x: int
    y: int
    anchor: str
    rotation: int
    size: Tuple[int, int] = (25, 25)
    canvas_id: int = field(init=False)
    image: Image = field(init=False)
    image_tk: PhotoImage = field(init=False)
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __post_init__(self):
        # render the asset
        self.image = Image.open(self._arrow_asset_path)
        self.image_tk = PhotoImage(self.image.rotate(self.rotation).resize(self.size))
        self.canvas_id = self.master.create_image(self.x, self.y, image=self.image_tk, anchor=self.anchor)

        # add tags
        self.master.addtag_withtag('arrow', self.canvas_id)
        self.master.addtag_withtag('selected', self.canvas_id)
        self.master.addtag_withtag('to_delete', self.canvas_id)

    @property
    def tags(self):
        return self.master.gettags(self.canvas_id)
