"""
main application class to run the program

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from tkinter import Tk
from model.counter import Counter


class Application(Tk):
    """ The application """
    def __init__(self):
        super().__init__()

        self.layout()
        self.mainloop()

    def layout(self):
        counter = Counter(master=self)
        counter.pack()


if __name__ == '__main__':
    Application()

#     Button(master=button_frame,
#            text='Click here',
#            width=25,
#            height=5,
#            bg='blue',
#            foreground='yellow'
#            ).pack()
#
#
#
# def add_border_buttons(self):
#     for b in BorderEffectOption:
#         frame = Frame(master=self, relief=b.value, borderwidth=5)
#         frame.pack(side=LEFT)
#         Label(master=frame, text=b.name).pack()
