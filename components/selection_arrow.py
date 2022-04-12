"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
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
        self.canvas.tag_bind(self.canvas_id, '<B1-Motion>', self.on_move, add='+')
        # self.canvas.tag_bind(self.canvas_id, '<B1-Motion>', self.on_move, add='+')

    @property
    def tags(self):
        return self.canvas.gettags(self.canvas_id)

    def on_move(self, event):
        self.canvas.delete(self.master.window)

        dx = event.x - self.master.x
        dy = event.y - self.master.y

        self.master.image_tk = PhotoImage(self.master.image.resize((dx, dy)))
        self.canvas.create_image(self.x, self.y, image=self.master.image_tk, anchor=self.master.anchor)

        # self.master.widget = Label(self.canvas,
        #                            image=self.master.image_tk,
        #                            height=dy,
        #                            width=dx,
        #                            bg='white'
        #                            )
        #
        # # create the window containing the image
        # self.master.window = self.canvas \
        #     .create_window(self.master.x,
        #                    self.master.y,
        #                    window=self.master.widget,
        #                    anchor=self.anchor
        #                    )

        self.canvas.scale(self.canvas_id, 0, 0, 1.05, 1.05)
