"""
Make object scalable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-01-30
"""
from components.selection_arrow import SelectionArrow
from logging import debug
from pathlib import Path
from tkinter import SE, SW, NE, NW, S, W, N, E


class Scalable:
    """ A Scalable implements methods to scale a container. """
    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, master, widget, window_id, label):
        self.master = master
        self.widget = widget
        self.window_id = window_id
        self.label = label

        self.widget.bind("<ButtonPress-1>", self.on_click, add='+')
        # self.widget.bind("<B1-Motion>", self.on_move, add='+')
        # self.widget.bind("<ButtonRelease-1>", self.on_release, add='+')
        # self.bbox_id = None

        # self.has_moved = False

    def on_click(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' in self.master.gettags(self.window_id):
            self._draw_arrows()

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.window_id}, '
              f'tags: {self.master.gettags(self.window_id)}')
    #
    # def on_move(self, _):
    #     """ Set has_moved to true when the selectable moves """
    #     self.has_moved = True

    # def on_release(self, event):
    #     """ on releasing the button, check if the widget was not selected in the same click event, by checking
    #     the selection_event tag. If the tag is present, remove it because release marks the end of the click event.
    #     If the widget is selected (has 'selected' tag) and it has not moved during the click event,
    #     execute deselect function. Lastly, set has_moved back to false, because is marks the end of the click event. """
    #     if 'selection_event' in self.master.gettags(self.window_id):
    #         self.master.dtag(self.window_id, 'selection_event')
    #     elif 'selected' in self.master.gettags(self.window_id) \
    #             and not self.has_moved:
    #         self._deselect()
    #
    #     self.has_moved = False
    #
    #     # debug statement
    #     debug(f'event: {event}, '
    #           f'func: select, '
    #           f'id: {self.window_id}, '
    #           f'tags: {self.master.gettags(self.window_id)}')
    #
    # def _select(self):
    #     """ finds the ids of currently selected items on the canvas and deselects those if they exist.
    #     Draws a bbox around the currently selected item and adds selected tags to the item and its bbox. """
    #     self._draw_arrows()
    #
    # def _deselect(self, other=None):
    #     """ deselects the objects if other is none else deselects the other object
    #     Also removes the bbox """
    #     [self.master.delete(c) for c in (self.master.find_withtag('to_delete') or [self.bbox_id])]
    #     self.master.dtag(other or self.window_id, 'selected')

    def _draw_arrows(self):
        """ draws the resizing arrows around the bounding box. """
        # collect the window coords
        left, top, right, bottom = self.master.bbox(self.window_id)
        length = bottom - top
        width = right - left

        # draw the arrows, first the rotated
        # self.a1 = SelectionArrow(self.master, left, top, SE, 45)
        # self.a2 = SelectionArrow(self.master, left, bottom, NE, 135)
        # self.a3 = SelectionArrow(self.master, right, bottom, NW, 225)
        # self.a4 = SelectionArrow(self.master, right, top, SW, 315)
        #
        # # then the straights
        # self.a5 = SelectionArrow(self.master, left + width / 2, top, S, 0)
        # self.a8 = SelectionArrow(self.master, left, top + length / 2, E, 90)
        # self.a7 = SelectionArrow(self.master, left + width / 2, bottom, N, 180)
        self.a6 = SelectionArrow(self.master, self.label, right, top + length / 2, W, 270)
