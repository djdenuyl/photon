"""
A rotatable container allows rotation of the image it contains

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-04-15
"""
from tkinter import S, SE, E, NE, N, NW, W, SW
from components.mutable import Mutable
from pathlib import Path

from components.rotation_arrow import RotationArrow


class Rotatable(Mutable):
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, container):
        super().__init__(container)

        # add bindings
        self._add_binding('<ButtonPress-1>', self.on_press)
        self._add_binding('<ButtonRelease-1>', self.on_release)

    def on_press(self, event):
        """ on click create the rotation arrows, if the container is currently displaying resize arrows"""

        if 'scale_arrows_active' in self.tags \
                and 'scale_arrows_selection_event' not in self.tags:
            # delete old arrows
            [self._delete(a) for a in self._tagged('scale_arrow')]
            self._remove_tag('scale_arrows_active')
            self._add_tag('rotation_arrows_active')
            self._add_tag('rotation_arrows_selection_event')

            # draw new arrows
            self._draw_arrows()

        # debug statement
        self._debug(event)

    def on_release(self, event):
        self._remove_tag('rotation_arrows_selection_event')

        # debug statement
        self._debug(event)
        print('end button click')

    def _draw_arrows(self):
        """ draws the rotation arrows around the bounding box. """
        # collect the window coords
        left, top, right, bottom = self.bbox
        length = bottom - top
        width = right - left

        xs = [left + width / 2, left, left, left, right - width / 2, right, right, right]
        ys = [top, top, top + length / 2, bottom, bottom, bottom, bottom - length / 2, top]
        directions = [S, SE, E, NE, N, NW, W, SW]

        arrows = []
        rotation = 0
        for d, x, y in zip(directions, xs, ys):
            arrows.append(
                RotationArrow(self.container, x, y, d, rotation)
            )

            rotation += 45
