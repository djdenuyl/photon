"""
Make object selectable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-01-30
"""
from logging import debug
from pathlib import Path
from tkinter import PhotoImage, Label, NW


class Selectable:
    """ A Selectable implements methods to select and deselect a container. """
    _bbox_width = 2
    _bbox_dash_length = 10
    _bbox_dash_spacing = 10

    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, master, widget, window_id_id):
        self.master = master
        self.widget = widget
        self.window_id = window_id_id

        self.widget.bind("<ButtonPress-1>", self.on_click, add='+')
        self.widget.bind("<B1-Motion>", self.on_move, add='+')
        self.widget.bind("<ButtonRelease-1>", self.on_release, add='+')
        self.bbox_id = None

        self.has_moved = False

    def on_click(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' not in self.master.gettags(self.window_id):
            self._select()

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.window_id}, '
              f'tags: {self.master.gettags(self.window_id)}')

    def on_move(self, _):
        """ Set has_moved to true when the selectable moves """
        self.has_moved = True

    def on_release(self, event):
        """ on releasing the button, check if the widget was not selected in the same click event, by checking
        the selection_event tag. If the tag is present, remove it because release marks the end of the click event.
        If the widget is selected (has 'selected' tag) and it has not moved during the click event,
        execute deselect function. Lastly, set has_moved back to false, because is marks the end of the click event. """
        if 'selection_event' in self.master.gettags(self.window_id):
            self.master.dtag(self.window_id, 'selection_event')
        elif 'selected' in self.master.gettags(self.window_id) \
                and not self.has_moved:
            self._deselect()

        self.has_moved = False

        # debug statement
        debug(f'event: {event}, '
              f'func: select, '
              f'id: {self.window_id}, '
              f'tags: {self.master.gettags(self.window_id)}')

    def _select(self):
        """ finds the ids of currently selected items on the canvas and deselects those if they exist.
        Draws a bbox around the currently selected item and adds selected tags to the item and its bbox. """

        # deselect any already selected widget
        currently_selected = self.master.find_withtag('selected')
        if currently_selected is not None:
            for c in currently_selected:
                self._deselect(c)

        # draw the bbox around the selected widget
        self.bbox_id = self.master.create_rectangle(
            *self.master.bbox(self.window_id),
            dash=(self._bbox_dash_length, self._bbox_dash_spacing),
            width=self._bbox_width
        )

        self._draw_arrows()

        # add 'selected' tag to selected item and its bbox
        self.master.addtag_withtag('selected', self.window_id)
        self.master.addtag_withtag('selected', self.bbox_id)
        self.master.addtag_withtag('selection_event', self.window_id)
        self.master.addtag_withtag('bbox', self.bbox_id)

    def _deselect(self, other=None):
        """ deselects the objects if other is none else deselects the other object
        Also removes the bbox """
        self.master.delete(self.master.find_withtag('bbox') or self.bbox_id)
        self.master.dtag(other or self.window_id, 'selected')

    def _draw_arrows(self):
        """ draws the resizing arrows around the bounding box. """
        debug(self.widget.winfo_rootx())
        debug(self.widget.winfo_rooty())

        # self.image = PhotoImage(file=self._arrow_asset_path)
        #
        # self.arrow_label = Label(self.master,
        #                     image=self.image,
        #                     height=self.image.height(),
        #                     width=self.image.width(),
        #                     bg='white'
        #                     )
        #
        # # create the window containing the image
        # self.arrow_window_id = self.master \
        #     .create_window(self.window.,
        #                    self.,
        #                    window=self.arrow_label,
        #                    anchor=NW
        #                    )
