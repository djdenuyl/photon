"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
"""
from dataclasses import dataclass, field
from logging import debug
from pathlib import Path
from tkinter import Canvas
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage
# from components.container import Container


@dataclass
class SelectionArrow:
    canvas: Canvas
    container: None
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
        self.canvas.tag_bind(self.canvas_id, '<B1-Motion>', self.on_move, add='+')

    @property
    def tags(self):
        return self.canvas.gettags(self.canvas_id)

    def on_click(self, event):
        debug(f'event: {event}, {self.__class__}')

        # collect the x,y event
        self.x_start = event.x
        self.y_start = event.y

    def on_move(self, event):
        l, t, r, b = self.canvas.bbox(self.container.id)
        w = r - l
        h = b - t

        dx = int(event.x - self.x_start)
        dy = int(event.y - self.y_start)
        x_mv = int(w + dx)
        y_mv = int(h)

        print(l, t, r, b)

        self.container.image_tk = PhotoImage(self.container.image.resize((x_mv, y_mv)))
        self.canvas.create_image(self.container.x, self.container.y, image=self.container.image_tk, anchor=self.container.anchor)

        # self.canvas.scale(self.canvas_id, l, t, x_mv / w,  h / h)
        self.canvas.move(self.canvas_id)