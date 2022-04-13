"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
"""
from dataclasses import dataclass, field
from logging import debug
from pathlib import Path
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage


@dataclass
class SelectionArrow:
    container: None
    x: int
    y: int
    anchor: str
    rotation: int
    size: Tuple[int, int] = (25, 25)
    id: int = field(init=False)
    image: Image = field(init=False)
    image_tk: PhotoImage = field(init=False)
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')
    _x_start = None
    _y_start = None

    def __post_init__(self):
        # render the asset
        self.image = Image.open(self._arrow_asset_path)
        self.image_tk = PhotoImage(self.image.rotate(self.rotation).resize(self.size), Image.ANTIALIAS)
        self.id = self.container.canvas.create_image(self.x, self.y, image=self.image_tk, anchor=self.anchor)

        # add tags
        self.container.canvas.addtag_withtag('arrow', self.id)
        self.container.canvas.addtag_withtag('selected', self.id)
        self.container.canvas.addtag_withtag('to_delete', self.id)

        # add bindings
        self.container.canvas.tag_bind(self.id, '<ButtonPress-1>', self.on_click, add='+')
        self.container.canvas.tag_bind(self.id, '<B1-Motion>', self.on_move, add='+')

    @property
    def tags(self):
        return self.container.canvas.gettags(self.id)

    def on_click(self, event):
        """ on click, collect the events x,y coords """
        debug(f'event: {event}, {self.__class__}')

        # collect the event x, y
        self._x_start = event.x
        self._y_start = event.y

    def on_move(self, event):
        """ on move, resize the image along the direction of the arrow. Also resize the bbox and arrow positions """
        # the left, top, right and bottom coord
        l, t, r, b = self.container.canvas.bbox(self.container.id)

        # the containers current dimensions
        w = r - l
        h = b - t

        # the amount of movement in x and y since last event
        dx = event.x - self._x_start
        dy = event.y - self._y_start

        # the new dimensions of the container
        x_mv = int(w + dx)
        y_mv = int(h) # + dy

        # resize the image and update the canvas
        self.container.image_tk = PhotoImage(self.container.image.resize((x_mv, y_mv)))
        self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

        # scale the arrows and bbox
        for a in self.container.canvas.find_withtag('to_delete'):
            self.container.canvas.scale(a, l, b - h // 2, x_mv / w, h / h)

        # update the event x, y
        self._x_start = event.x
        self._y_start = event.y
