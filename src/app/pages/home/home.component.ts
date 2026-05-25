import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  examples = [
    { src: 'assets/examples/Ejemplo1.png', title: 'Ejemplo 1' },
    { src: 'assets/examples/Ejemplo2.png', title: 'Ejemplo 2' },
    { src: 'assets/examples/Ejemplo3.png', title: 'Ejemplo 3' }
  ];
}
