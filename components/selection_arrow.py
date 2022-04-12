"""
Created on %(date)s

@author: David den Uyl (ddenuyl@bebr.nl)
"""
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import Canvas, Label
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage
# from components.container import Container


@dataclass
class SelectionArrow:
    canvas: Canvas
    master: None
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
        self.image_tk = PhotoImage(self.image.rotate(self.rotation).resize(self.size), Image.ANTIALIAS)
        self.canvas_id = self.canvas.create_image(self.x, self.y, image=self.image_tk, anchor=self.anchor)

        # add tags
        self.canvas.addtag_withtag('arrow', self.canvas_id)
        self.canvas.addtag_withtag('selected', self.canvas_id)
        self.canvas.addtag_withtag('to_delete', self.canvas_id)

        # add bindings
        self.canvas.tag_bind(self.canvas_id, '<ButtonPress-1>', self.on_click, add='+')
        # self.canvas.tag_bind(self.canvas_id, '<B1-Motion>', self.on_move, add='+')

    @property
    def tags(self):
        return self.canvas.gettags(self.canvas_id)

    def on_click(self, _):
        self.canvas.delete(self.master.window)

        self.master.image_tk = PhotoImage(self.master.image.resize((40, 40)))

        self.master.widget = Label(self.canvas,
                                   image=self.master.image_tk,
                                   height=40,
                                   width=40,
                                   bg='white'
                                   )

        # create the window containing the image
        self.master.window = self.canvas \
            .create_window(self.master.x,
                           self.master.y,
                           window=self.master.widget,
                           anchor=self.anchor
                           )

        self.canvas.scale(self.canvas_id, 0, 0, 1.5, 1.5)
