"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
"""
from dataclasses import dataclass, field
from enum import Enum
from logging import debug
from pathlib import Path
from time import sleep
from tkinter import NE
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage


direction = {
    'ne': ('r', 't'),
    'nw': ('l', 't'),
    'se': ('r', 'b'),
    'sw': ('l', 'b')
}

@dataclass
class SelectionArrow:
    container: None
    x: int
    y: int
    anchor: str
    new_anchor: str
    rotation: int
    size: Tuple[int, int] = (25, 25)
    id: int = field(init=False)
    image: Image = field(init=False)
    image_tk: PhotoImage = field(init=False)
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')
    _x_start = None
    _y_start = None
    bbox_dct: dict = field(init=False)

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
        self.container.canvas.tag_bind(self.id, '<ButtonRelease-1>', self.on_release, add='+')

    @property
    def tags(self):
        return self.container.canvas.gettags(self.id)

    def on_click(self, event):
        """ on click, collect the events x,y coords """
        debug(f'event: {event}, {self.__class__}')

        # collect the event x, y
        self._x_start = event.x
        self._y_start = event.y

        self._update_anchor(self.container.anchor, self.new_anchor)

    def on_move(self, event):
        """ on move, resize the image along the direction of the arrow. Also resize the bbox and arrow positions """
        # TODO: to change W / E drag
        # change sign +/- in x_mv
        # anchor in scale from l to r

        # the left, top, right and bottom coord
        l, t, r, b = self.container.canvas.bbox(self.container.id)

        # the containers current dimensions
        w = r - l
        h = b - t

        # the amount of movement in x and y since last event
        dx = event.x - self._x_start
        dy = event.y - self._y_start

        # the new dimensions of the container
        if self.new_anchor == 'nw':
            x_mv = int(w + dx)
        else:
            x_mv = int(w - dx)
        y_mv = int(h) # + dy

        # print(f'{self._x_start=}')
        # print(f'{event.x=}')
        # print(f'{dx=}')
        # print(f'{x_mv=}')

        # resize the image and update the canvas
        self.container.image_tk = PhotoImage(self.container.image.resize((x_mv, y_mv)))
        self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

        z = self.bbox_dct.get(direction.get(self.new_anchor)[0])

        # scale the arrows and bbox
        for a in self.container.canvas.find_withtag('to_delete'):
            self.container.canvas.scale(a, z, b - h // 2, x_mv / w, y_mv / h)

        # update the event x, y
        self._x_start = event.x
        self._y_start = event.y

    def on_release(self, event):
        """ set anchor back to original """
        self._update_anchor(self.new_anchor, self.container.anchor)

    def _update_anchor(self, anchor, new_anchor):
        # reset anchor
        #   1. get coords of container bbox
        #   2. store these in a dict
        #   3. lookup the coord values corresponding to the anchor
        #   4. move the container to the new coords
        #   5. update the anchor point (this will cause it to move back to the original bbox)
        print(anchor)
        print(new_anchor)
        l, t, r, b = self.container.canvas.bbox(self.container.id)
        self.bbox_dct = dict(l=l, t=t, r=r, b=b)
        print(self.bbox_dct)

        if anchor != new_anchor:
            print('current anchor point')
            print([self.bbox_dct.get(a) for a in direction.get(anchor)])
            print('new anchor point')
            args = [self.bbox_dct.get(a) for a in direction.get(new_anchor)]
            print(args)
            self.container.canvas.move(self.container.id, args[0], args[1])
            self.container.canvas.itemconfig(self.container.id, anchor=new_anchor)
