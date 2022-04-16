"""
Rotation arrows are the arrows that are rendered when a widgets rotation is selected. When dragged they rotate the
widget in the arrow direction from the .

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-15
"""
from logging import debug
from pathlib import Path
from tkinter import S, W, N, E
from typing import Tuple, Optional
from PIL import Image
from PIL.ImageTk import PhotoImage
from components.mutable import Mutable

direction = {
    'n': ('r', 't'),
    'ne': ('r', 't'),
    'e': ('r', 't'),
    'se': ('r', 'b'),
    's': ('l', 'b'),
    'sw': ('l', 'b'),
    'w': ('l', 'b'),
    'nw': ('l', 't')
}


class RotationArrow(Mutable):
    _size: Tuple[int, int] = (25, 25)
    _arrow_asset_path: Path = Path('assets', 'images', 'rotation_arrow.png')

    def __init__(self, container, x, y, anchor, rotation, size=None):
        super().__init__(container)
        self.x: int = x
        self.y: int = y
        self.anchor: str = anchor
        self.rotation: int = rotation
        self.size: Tuple[int, int] = size or self._size
        self._event_x: Optional[int] = None
        self._event_y: Optional[int] = None

        # render the asset
        self.image = Image.open(self._arrow_asset_path)
        self.image_tk = PhotoImage(self.image.rotate(self.rotation).resize(self.size), Image.ANTIALIAS)
        self.id = self.canvas.create_image(self.x, self.y, image=self.image_tk, anchor=self.anchor)

        # add tags
        self._add_tag('rotation_arrow', self.id)
        self._add_tag('selected', self.id)
        self._add_tag('to_delete', self.id)

        # add bindings
        self._add_binding('<ButtonPress-1>', self.on_press, self.id)
        self._add_binding('<B1-Motion>', self.on_move, self.id)
        self._add_binding('<ButtonRelease-1>', self.on_release)

        self.image_rotation = 0

    def on_press(self, event):
        """ on click, collect the events x,y coords and set the anchor to the scale anchor for this arrow """
        self.image_rotation += 45

        self.container.image_tk = PhotoImage(self.container.image.resize(self.container.size).rotate(self.image_rotation))
        self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

        self._debug(event)

    def on_move(self, event):
        """ on move, resize the image along the direction of the arrow. Also resize the bbox and arrow positions """
        # resize the image and update the canvas
        # self.container.image_tk = PhotoImage(self.container.image.rotate(45))
        # self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

    def on_release(self, event):
        """ set anchor back to original """

        self._debug(event)
