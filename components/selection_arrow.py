"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
"""
from dataclasses import dataclass, field
from logging import debug
from pathlib import Path
from tkinter import S, W, N, E
from typing import Tuple
from PIL import Image
from PIL.ImageTk import PhotoImage


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


@dataclass
class SelectionArrow:
    container: None
    x: int
    y: int
    anchor: str  # the anchorage of the arrow relative to its container
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
        self.container.canvas.tag_bind(self.id, '<ButtonRelease-1>', self.on_release, add='+')

    @property
    def tags(self):
        """ get all tags for this object """
        return self.container.canvas.gettags(self.id)

    @property
    def container_anchor(self):
        """ get the CURRENT anchor for the container. NB. self.container.anchor gets the INITIAL anchor """
        return self.container.canvas.itemcget(self.container.id, "anchor")

    @property
    def container_bbox(self):
        """ get the CURRENT bbox of the container """
        l, t, r, b = self.container.canvas.bbox(self.container.id)
        return dict(l=l, t=t, r=r, b=b)

    @property
    def container_dimensions(self):
        """ get the CURRENT dimensions of the container """
        l, t, r, b = [v for _, v in self.container_bbox.items()]
        # return the width, height
        return r - l, b - t

    def on_click(self, event):
        """ on click, collect the events x,y coords and set the anchor to the scale anchor for this arrow """
        debug(f'event: {event}, {self.__class__}')

        # collect the event x, y
        self._x_start = event.x
        self._y_start = event.y

        # set the anchor to the right position for scaling using this arrow
        self._update_anchor(self.anchor)

    def on_move(self, event):
        """ on move, resize the image along the direction of the arrow. Also resize the bbox and arrow positions """
        # calculate container dimensions
        w0, h0 = self.container_dimensions

        # the amount of movement in x and y since last event
        dx = event.x - self._x_start
        dy = event.y - self._y_start

        # determine how to calculate the new w/h of the container based on the anchorage
        if W in self.anchor:
            w = int(w0 + dx)
        elif E in self.anchor:
            w = int(w0 - dx)
        else:
            w = int(w0)

        if S in self.anchor:
            h = int(h0) - dy
        elif N in self.anchor:
            h = int(h0) + dy
        else:
            h = int(h0)

        # resize the image and update the canvas
        self.container.image_tk = PhotoImage(self.container.image.resize((w, h)))
        self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

        # find the x, y anchorage
        x, y = self._get_coords_for_cardinal_direction(self.anchor)

        # scale the arrows and bbox
        for a in self.container.canvas.find_withtag('to_delete'):
            self.container.canvas.scale(a, x, y, w / w0, h / h0)

        # update the event x, y
        self._x_start = event.x
        self._y_start = event.y

    def on_release(self, event):
        """ set anchor back to original """
        debug(f'event: {event}, {self.__class__}')
        self._update_anchor(self.container.anchor)

    def _update_anchor(self, scale_anchor):
        """ update anchor
        #   1. get coords of container bbox
        #   2. lookup the coord values corresponding to the anchor
        #   3. move the container to the new coords
        #   4. update the anchor point (this will cause it to move back to the original bbox)
        """
        debug('updating anchor')
        debug(f'current anchor: {self.container_anchor} '
              f'at coords: {self.container.canvas.bbox(self.container.id)} '
              f'target anchor: {scale_anchor}')

        # if the target anchorage is already the current anchorage, skip updating
        if scale_anchor != self.container_anchor:
            # get the proper anchorage coords for the target anchor
            coords = self._get_coords_for_cardinal_direction(scale_anchor)
            print(coords)

            # update the container to the new coords
            self.container.canvas.coords(self.container.id, *coords)
            # configure the container to the target anchor
            self.container.canvas.itemconfig(self.container.id, anchor=scale_anchor)

            debug(f'new anchor: {self.container.canvas.itemcget(self.container.id, "anchor")} '
                  f'at coords: {self.container.canvas.bbox(self.container.id)}')

        debug('container anchor is already scale anchor, skipping')

    def _get_coords_for_cardinal_direction(self, anchor):
        """ given the cardinal direction, return the coords of the current containers bbox
        offset by half the width / length depending on the cardinal direction """
        # get the coords for the anchor
        x, y = [self.container_bbox.get(a) for a in direction.get(anchor)]

        # determine the current width and height
        w, h = self.container_dimensions

        # offset if needed
        if anchor == S:
            x += w / 2
        if anchor == W:
            y -= h / 2
        if anchor == N:
            x -= w / 2
        if anchor == E:
            y += h / 2

        return x, y
