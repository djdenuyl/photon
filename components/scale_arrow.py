"""
Selection arrows are the arrows that are rendered when a widget is selected. When dragged they resize the
widget in the arrow direction.

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-11
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


class ScaleArrow(Mutable):
    _size: Tuple[int, int] = (25, 25)
    _arrow_asset_path: Path = Path('assets', 'images', 'sizing_arrow.png')

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
        self._add_tag('scale_arrow', self.id)
        self._add_tag('selected', self.id)
        self._add_tag('to_delete', self.id)

        # add bindings
        self._add_binding('<ButtonPress-1>', self.on_press, self.id)
        self._add_binding('<B1-Motion>', self.on_move, self.id)
        self._add_binding('<ButtonRelease-1>', self.on_release)

    def on_press(self, event):
        """ on click, collect the events x,y coords and set the anchor to the scale anchor for this arrow """

        # collect the event x, y
        self._event_x = event.x
        self._event_y = event.y

        # set the anchor to the right position for scaling using this arrow
        self._update_anchor(self.anchor)

        self._debug(event)

    def on_move(self, event):
        """ on move, resize the image along the direction of the arrow. Also resize the bbox and arrow positions """
        # calculate container dimensions
        w0, h0 = self.dimensions

        # the amount of movement in x and y since last event
        dx = event.x - self._event_x
        dy = event.y - self._event_y

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

        # h and w must be > 0
        if h < 1:
            h = 1
        if w < 1:
            w = 1

        # resize the image and update the canvas
        self.container.image_tk = PhotoImage(self.container.image.resize((w, h)).rotate(self.container.image_rotation))
        self.container.canvas.itemconfig(self.container.id, image=self.container.image_tk)

        # find the x, y anchorage
        x, y = self._get_coords_for_cardinal_direction(self.anchor)

        # scale the arrows and bbox
        for a in self.container.canvas.find_withtag('to_delete'):
            self.container.canvas.scale(a, x, y, w / w0, h / h0)

        # update the event x, y
        self._event_x = event.x
        self._event_y = event.y

    def on_release(self, event):
        """ set anchor back to original """
        self._update_anchor(self.container.anchor)

        self._debug(event)

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
        x, y = [self.bbox_dict.get(a) for a in direction.get(anchor)]

        # determine the current width and height
        w, h = self.dimensions

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
