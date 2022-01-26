"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from tkinter import Canvas, PhotoImage
from components.draggable import Draggable


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kw):
        super().__init__(**kw)
        self.dnd_id = None

        self.image = PhotoImage(file='data/ball_small.png')
        # self.canvas_image = self.create_image(self.winfo_width()/2,
        #                                       self.winfo_height()/2,
        #                                       anchor=CENTER,
        #                                       image=self.image
        #                                       )

        # label = Label(self, image=self.image, borderwidth=2,
        #               relief="raised",
        #               width=self.image.width(), height=self.image.height()
        #               )
        # id = self.create_window(10, 10, window=label, anchor="nw")

        label = Draggable(image=self.image)

        label.attach(self)

    def dnd_accept(self, source: Draggable, event):
        """"""
        return self

    def dnd_enter(self, source: Draggable, event):
        """"""
        x, y = source.where(self, event)
        x1, y1, x2, y2 = source.canvas.bbox(source.id)
        dx, dy = x2-x1, y2-y1
        self.dnd_id = self.create_rectangle(x, y, x+dx, y+dy)
        self.dnd_motion(source, event)

    def dnd_motion(self, source: Draggable, event):
        """ move the bbox on motion """
        x, y = source.where(self, event)
        x1, y1, x2, y2 = self.bbox(self.dnd_id)
        self.move(self.dnd_id, x-x1, y-y1)

    def dnd_leave(self, source: Draggable, event):
        """ Delete the existing drag and drop id and reset the attribute """
        self.delete(self.dnd_id)
        self.dnd_id = None

    def dnd_commit(self, source: Draggable, event):
        """ delete the source widget and attach a new target widget at the x,y position """
        self.dnd_leave(source, event)
        x, y = source.where(self, event)
        source.attach(self, x, y)
